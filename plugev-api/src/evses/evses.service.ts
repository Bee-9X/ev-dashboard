import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { P } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import { Page, toPage } from '../common/pagination';
import { APP_CONFIG, AppConfig } from '../config/config';
import {
    ConnectorEntity, ConnectorLiveStateEntity, ConnectorType, EvseEntity, EvseLiveStateEntity, NetworkEntity, StationEntity,
} from '../database/entities';
import { latestReadings, SessionLiveView } from '../sessions/session-live';
import {
    ConnectorInputDto, CreateEvseDto, EvseListQueryDto, MAX_CONNECTORS, UpdateConnectorDto, UpdateEvseDto,
} from './evses.dto';

/** The last status the charger reported for a connector (OCPP StatusNotification). */
export interface ConnectorLiveView {
    status: string;
    errorCode: string | null;
    info: string | null;
    vendorErrorCode: string | null;
    statusAt: Date;
}

/** The session charging on a connector right now, with its latest readings (FR MON 004). */
export type ActiveSessionView = SessionLiveView & {
    id: string;
    startedAt: Date | null;
};

export type ConnectorView = ConnectorEntity & {
    /** Printed under the QR code and typed in when scanning fails, e.g. K7M3QX-1. */
    qrCode: string;
    /** What the QR code contains. */
    qrUrl: string;
    /** Null until the charger reports a status for this connector. */
    live: ConnectorLiveView | null;
    /** Null when nothing is charging on it. */
    activeSession: ActiveSessionView | null;
};

/** What the charger last reported (FR EVSE 003, FR MON 003). Null until the charger is first heard from. */
export interface EvseLiveView {
    /** Connected and heard from recently. */
    online: boolean;
    /** As last recorded; `online` also accounts for silence (no message for CHARGER_OFFLINE_AFTER_SEC). */
    connectionState: 'online' | 'offline';
    protocol: string | null;
    lastSeenAt: Date | null;
    connectedAt: Date | null;
    disconnectedAt: Date | null;
    disconnectReason: string | null;
    lastBootAt: Date | null;
    reported: { vendor: string | null; model: string | null; serialNumber: string | null; firmwareVersion: string | null };
    /** Status of connector 0: the charger as a whole. */
    chargerStatus: ConnectorLiveView | null;
    /** Connector numbers the charger reports that are not registered here. */
    unregisteredConnectors: number[];
}

export type EvseView = EvseEntity & { connectors: ConnectorView[]; live: EvseLiveView | null };

/** No 0/O or 1/I, so a printed code can be read and typed back. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const DC_ONLY: ConnectorType[] = ['CCS2', 'CCS1', 'CHADEMO'];
const AC_ONLY: ConnectorType[] = ['TYPE2', 'TYPE1'];

function constraintOf(e: unknown): string | undefined {
    return e instanceof QueryFailedError && (e as { code?: string }).code === '23505'
        ? (e as { driverError?: { constraint?: string } }).driverError?.constraint
        : undefined;
}

/** The current a connector type carries; GB/T exists in both, so it must be given. */
function currentFor(type: ConnectorType, given: 'AC' | 'DC' | undefined): 'AC' | 'DC' {
    const fixed = DC_ONLY.includes(type) ? 'DC' : AC_ONLY.includes(type) ? 'AC' : undefined;
    if (fixed && given && given !== fixed) {
        throw Errors.badRequest('VALIDATION_FAILED', `${type} connectors are always ${fixed}`);
    }
    const current = fixed ?? given;
    if (!current) throw Errors.badRequest('VALIDATION_FAILED', 'Choose AC or DC for a GB/T connector');
    return current;
}

function checkFormat(format: 'cable' | 'socket', current: 'AC' | 'DC') {
    if (format === 'socket' && current === 'DC') {
        throw Errors.badRequest('VALIDATION_FAILED', 'DC connectors always have an attached cable');
    }
}

/**
 * Chargers (EVSEs) and their connectors (FR EVSE 001, 002, 004, 006).
 * Live state (online, last seen, connector availability, faults: FR EVSE 003) comes from the charging module.
 */
@Injectable()
export class EvsesService {
    constructor(
        private readonly db: DataSource,
        private readonly audit: AuditService,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {}

    async list(ctx: AccessContext, q: EvseListQueryDto): Promise<Page<EvseView>> {
        const qb = this.db.getRepository(EvseEntity).createQueryBuilder('e');
        const scope = ctx.scopeFor(P.EVSE_READ);
        if (!scope.all) {
            if (!scope.networkIds.length && !scope.stationIds.length) return toPage([], 0, q);
            qb.andWhere('(e.network_id = ANY(:nets) OR e.station_id = ANY(:stations))', { nets: scope.networkIds, stations: scope.stationIds });
        }
        if (q.networkId) qb.andWhere('e.network_id = :networkId', { networkId: q.networkId });
        if (q.stationId) qb.andWhere('e.station_id = :stationId', { stationId: q.stationId });
        const [items, total] = await qb.orderBy('e.created_at', 'ASC').addOrderBy('e.id', 'ASC')
            .skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
        return toPage(await this.withConnectors(items), total, q);
    }

    async get(ctx: AccessContext, id: string): Promise<EvseView> {
        const [view] = await this.withConnectors([await this.findInScope(ctx, id)]);
        return view!;
    }

    async create(ctx: AccessContext, dto: CreateEvseDto): Promise<EvseView> {
        const station = await this.db.getRepository(StationEntity).findOneBy({ id: dto.stationId });
        // the client names the station; the server checks it is inside the caller's scope (spec 2.2)
        if (!station || !ctx.canOnStation(P.EVSE_CREATE, station.id, station.networkId)) throw Errors.notFound('Station');
        await this.requireNetwork(station.networkId, 'active');

        const numbers = dto.connectors.map(c => c.connectorNumber);
        if (new Set(numbers).size !== numbers.length) {
            throw Errors.badRequest('VALIDATION_FAILED', 'Each connector needs its own number');
        }
        const connectors = dto.connectors.map(c => this.connectorValues(c));

        for (let attempt = 0; ; attempt++) {
            try {
                const evse = await this.db.transaction(async m => {
                    const saved = await m.getRepository(EvseEntity).save(m.create(EvseEntity, {
                        networkId: station.networkId,
                        stationId: station.id,
                        publicCode: newPublicCode(),
                        name: dto.name ?? null,
                        protocol: dto.protocol,
                        protocolIdentity: dto.protocolIdentity,
                        vendor: dto.vendor,
                        model: dto.model,
                        serialNumber: dto.serialNumber ?? null,
                        firmwareVersion: null,
                        maxPowerKw: dto.maxPowerKw ?? null,
                        status: 'active',
                    }));
                    await m.getRepository(ConnectorEntity).save(connectors.map(c => m.create(ConnectorEntity, { ...c, evseId: saved.id })));
                    await this.audit.record({
                        actor: ctx, action: 'evse.create', resourceType: 'evse', resourceId: saved.id,
                        networkId: saved.networkId, stationId: saved.stationId,
                        details: {
                            protocolIdentity: saved.protocolIdentity, protocol: saved.protocol, publicCode: saved.publicCode,
                            connectors: connectors.map(c => `${c.connectorNumber}: ${c.connectorType} ${c.currentType} ${c.maxPowerKw} kW`),
                        },
                    }, m);
                    return saved;
                });
                return this.get(ctx, evse.id);
            } catch (e) {
                const constraint = constraintOf(e);
                if (constraint === 'evses_public_code_uq' && attempt < 5) continue; // rare clash of random codes
                if (constraint === 'evses_protocol_identity_uq') throw identityTaken();
                throw e;
            }
        }
    }

    async update(ctx: AccessContext, id: string, dto: UpdateEvseDto): Promise<EvseView> {
        const evse = await this.findInScope(ctx, id);
        if (!ctx.canOnStation(P.EVSE_UPDATE, evse.stationId, evse.networkId)) throw Errors.forbidden();
        await this.requireNetwork(evse.networkId, 'not-archived');

        if (dto.stationId !== undefined && dto.stationId !== evse.stationId) {
            const target = await this.db.getRepository(StationEntity).findOneBy({ id: dto.stationId });
            if (!target || !ctx.canOnStation(P.EVSE_UPDATE, target.id, target.networkId)) throw Errors.notFound('Station');
            if (target.networkId !== evse.networkId) {
                throw Errors.conflict('A charger can only move to a station of the same network', 'DIFFERENT_NETWORK');
            }
        }

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of ['stationId', 'name', 'protocol', 'protocolIdentity', 'vendor', 'model', 'serialNumber', 'maxPowerKw', 'status', 'commandUrl'] as const) {
            const to = dto[key];
            if (to !== undefined && to !== evse[key]) changes[key] = { from: evse[key], to };
        }
        if (!Object.keys(changes).length) return this.get(ctx, id);

        try {
            await this.db.transaction(async m => {
                Object.assign(evse, Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])));
                await m.getRepository(EvseEntity).save(evse);
                await this.audit.record({
                    actor: ctx,
                    action: changes.status ? 'evse.status_change' : changes.stationId ? 'evse.move' : 'evse.update',
                    resourceType: 'evse', resourceId: id, networkId: evse.networkId, stationId: evse.stationId, details: { changes },
                }, m);
            });
        } catch (e) {
            if (constraintOf(e) === 'evses_protocol_identity_uq') throw identityTaken();
            throw e;
        }
        return this.get(ctx, id);
    }

    async addConnector(ctx: AccessContext, evseId: string, dto: ConnectorInputDto): Promise<EvseView> {
        const evse = await this.findInScope(ctx, evseId);
        if (!ctx.canOnStation(P.EVSE_UPDATE, evse.stationId, evse.networkId)) throw Errors.forbidden();
        await this.requireNetwork(evse.networkId, 'not-archived');
        const values = this.connectorValues(dto);

        try {
            await this.db.transaction(async m => {
                const existing = await m.getRepository(ConnectorEntity).countBy({ evseId });
                if (existing >= MAX_CONNECTORS) {
                    throw Errors.conflict(`A charger has at most ${MAX_CONNECTORS} connectors`, 'TOO_MANY_CONNECTORS');
                }
                const saved = await m.getRepository(ConnectorEntity).save(m.create(ConnectorEntity, { ...values, evseId }));
                await this.audit.record({
                    actor: ctx, action: 'connector.create', resourceType: 'connector', resourceId: saved.id,
                    networkId: evse.networkId, stationId: evse.stationId,
                    details: { evseId, connector: `${values.connectorNumber}: ${values.connectorType} ${values.currentType} ${values.maxPowerKw} kW` },
                }, m);
            });
        } catch (e) {
            if (constraintOf(e) === 'connectors_evse_number_uq') {
                throw Errors.conflict(`This charger already has a connector ${dto.connectorNumber}`, 'CONNECTOR_NUMBER_TAKEN');
            }
            throw e;
        }
        return this.get(ctx, evseId);
    }

    async updateConnector(ctx: AccessContext, evseId: string, connectorId: string, dto: UpdateConnectorDto): Promise<EvseView> {
        const evse = await this.findInScope(ctx, evseId);
        if (!ctx.canOnStation(P.EVSE_UPDATE, evse.stationId, evse.networkId)) throw Errors.forbidden();
        await this.requireNetwork(evse.networkId, 'not-archived');
        const connector = await this.db.getRepository(ConnectorEntity).findOneBy({ id: connectorId, evseId });
        if (!connector) throw Errors.notFound('Connector');

        const type = dto.connectorType ?? connector.connectorType;
        // changing the type may change the current (e.g. CCS2 to Type 2); keep the old current only where it still fits
        const current = currentFor(type, dto.currentType ?? (type === 'GBT' ? connector.currentType : undefined));
        const format = dto.format ?? (current === 'DC' ? 'cable' : connector.format);
        checkFormat(format, current);

        const next = { connectorType: type, currentType: current, format, maxPowerKw: dto.maxPowerKw ?? connector.maxPowerKw, status: dto.status ?? connector.status };
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const [key, to] of Object.entries(next) as [keyof typeof next, unknown][]) {
            if (to !== connector[key]) changes[key] = { from: connector[key], to };
        }
        if (Object.keys(changes).length) {
            await this.db.transaction(async m => {
                Object.assign(connector, next);
                await m.getRepository(ConnectorEntity).save(connector);
                await this.audit.record({
                    actor: ctx, action: changes.status ? 'connector.status_change' : 'connector.update',
                    resourceType: 'connector', resourceId: connector.id, networkId: evse.networkId, stationId: evse.stationId,
                    details: { evseId, connectorNumber: connector.connectorNumber, changes },
                }, m);
            });
        }
        return this.get(ctx, evseId);
    }

    /** Out-of-scope chargers look like they do not exist (spec 11.4). */
    private async findInScope(ctx: AccessContext, id: string): Promise<EvseEntity> {
        const evse = await this.db.getRepository(EvseEntity).findOneBy({ id });
        if (!evse || !ctx.canOnStation(P.EVSE_READ, evse.stationId, evse.networkId)) throw Errors.notFound('Charger');
        return evse;
    }

    private async requireNetwork(networkId: string, rule: 'active' | 'not-archived', m?: EntityManager) {
        const network = await (m ?? this.db.manager).getRepository(NetworkEntity).findOneByOrFail({ id: networkId });
        if (rule === 'active' && network.status !== 'active') {
            throw Errors.conflict('Chargers can only be added to an active network', 'NETWORK_NOT_ACTIVE');
        }
        if (network.status === 'archived') throw Errors.conflict('Archived networks cannot be changed', 'NETWORK_ARCHIVED');
    }

    private connectorValues(c: ConnectorInputDto) {
        const currentType = currentFor(c.connectorType, c.currentType);
        const format = c.format ?? 'cable';
        checkFormat(format, currentType);
        return {
            connectorNumber: c.connectorNumber, connectorType: c.connectorType, currentType, maxPowerKw: c.maxPowerKw, format,
            status: 'active' as const,
        };
    }

    private async withConnectors(evses: EvseEntity[]): Promise<EvseView[]> {
        if (!evses.length) return [];
        const ids = In(evses.map(e => e.id));
        const [connectors, liveStates, connectorStates, activeRows] = await Promise.all([
            this.db.getRepository(ConnectorEntity).find({ where: { evseId: ids }, order: { connectorNumber: 'ASC' } }),
            this.db.getRepository(EvseLiveStateEntity).find({ where: { evseId: ids } }),
            this.db.getRepository(ConnectorLiveStateEntity).find({ where: { evseId: ids } }),
            this.db.query(
                `SELECT DISTINCT ON (evse_id, connector_number) id, evse_id, connector_number, started_at, meter_start_wh
                 FROM charging_sessions WHERE evse_id = ANY($1::uuid[]) AND status = 'active'
                 ORDER BY evse_id, connector_number, started_at DESC`,
                [evses.map(e => e.id)],
            ) as Promise<{ id: string; evse_id: string; connector_number: number; started_at: Date | null; meter_start_wh: string | null }[]>,
        ]);
        const readings = await latestReadings(this.db, activeRows.map(r => ({
            id: r.id, meterStartWh: r.meter_start_wh === null ? null : Number(r.meter_start_wh),
        })));
        const activeOf = (evseId: string, n: number): ActiveSessionView | null => {
            const r = activeRows.find(a => a.evse_id === evseId && a.connector_number === n);
            if (!r) return null;
            return { id: r.id, startedAt: r.started_at, ...readings.get(r.id)! };
        };
        const staleBefore = Date.now() - this.config.chargerOfflineAfterSec * 1000;
        const liveOf = (s: ConnectorLiveStateEntity | undefined): ConnectorLiveView | null =>
            s ? { status: s.status, errorCode: s.errorCode, info: s.info, vendorErrorCode: s.vendorErrorCode, statusAt: s.statusAt } : null;

        return evses.map(e => {
            const own = connectors.filter(c => c.evseId === e.id);
            const states = connectorStates.filter(s => s.evseId === e.id);
            const live = liveStates.find(l => l.evseId === e.id);
            return Object.assign(e, {
                connectors: own.map(c => {
                    const qrCode = `${e.publicCode}-${c.connectorNumber}`;
                    return Object.assign(c, {
                        qrCode,
                        qrUrl: `${this.config.qrLinkBase}/${qrCode}`,
                        live: liveOf(states.find(s => s.connectorNumber === c.connectorNumber)),
                        activeSession: activeOf(e.id, c.connectorNumber),
                    });
                }),
                live: live ? {
                    online: live.connectionState === 'online' && !!live.lastSeenAt && live.lastSeenAt.getTime() >= staleBefore,
                    connectionState: live.connectionState,
                    protocol: live.protocol,
                    lastSeenAt: live.lastSeenAt,
                    connectedAt: live.connectedAt,
                    disconnectedAt: live.disconnectedAt,
                    disconnectReason: live.disconnectReason,
                    lastBootAt: live.lastBootAt,
                    reported: {
                        vendor: live.reportedVendor, model: live.reportedModel,
                        serialNumber: live.reportedSerial, firmwareVersion: live.reportedFirmware,
                    },
                    chargerStatus: liveOf(states.find(s => s.connectorNumber === 0)),
                    unregisteredConnectors: states
                        .map(s => s.connectorNumber)
                        .filter(n => n > 0 && !own.some(c => c.connectorNumber === n))
                        .sort((a, b) => a - b),
                } : null,
            });
        });
    }
}

function newPublicCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return code;
}

const identityTaken = () =>
    Errors.conflict('Another charger is already registered with this protocol identity', 'PROTOCOL_IDENTITY_TAKEN');
