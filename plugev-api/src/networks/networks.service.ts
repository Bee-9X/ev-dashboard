import { Injectable } from '@nestjs/common';
import { DataSource, In, QueryFailedError } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { P } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import { Page, PageQueryDto, toPage } from '../common/pagination';
import { NetworkEntity, StationEntity } from '../database/entities';
import { CreateNetworkDto, CreateStationDto, StationListQueryDto, UpdateNetworkDto, UpdateStationDto } from './networks.dto';

/** A network as listed: with the number of its stations (all of them, for the network's own admins and Super Admins). */
export type NetworkWithCount = NetworkEntity & { stationCount: number };

const STATION_FIELDS = [
    'name', 'status', 'address', 'phone', 'latitude', 'longitude', 'timeZone', 'operatingHours', 'amenities', 'publicVisible',
] as const;

const isUniqueViolation = (e: unknown) => e instanceof QueryFailedError && (e as { code?: string }).code === '23505';

/**
 * Minimal networks and stations: enough to establish tenants and station scope for RBAC.
 * Full station, EVSE and connector management is Phase 2 (backlog E2.2–E2.4).
 */
@Injectable()
export class NetworksService {
    constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

    async list(ctx: AccessContext, q: PageQueryDto): Promise<Page<NetworkWithCount>> {
        const scope = ctx.scopeFor(P.NETWORK_READ);
        if (!scope.all && !scope.networkIds.length) return toPage([], 0, q);
        const [items, total] = await this.db.getRepository(NetworkEntity).findAndCount({
            where: scope.all ? {} : { id: In(scope.networkIds) },
            order: { name: 'ASC' },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
        });
        const counts = new Map<string, number>();
        if (items.length) {
            const rows: { network_id: string; count: string }[] = await this.db.query(
                'SELECT network_id, count(*) AS count FROM stations WHERE network_id = ANY($1) GROUP BY network_id',
                [items.map(n => n.id)]);
            for (const r of rows) counts.set(r.network_id, Number(r.count));
        }
        return toPage(items.map(n => Object.assign(n, { stationCount: counts.get(n.id) ?? 0 })), total, q);
    }

    async get(ctx: AccessContext, id: string): Promise<NetworkEntity> {
        if (!ctx.canOnNetwork(P.NETWORK_READ, id)) throw Errors.notFound('Network');
        const network = await this.db.getRepository(NetworkEntity).findOneBy({ id });
        if (!network) throw Errors.notFound('Network');
        return network;
    }

    async create(ctx: AccessContext, dto: CreateNetworkDto): Promise<NetworkEntity> {
        try {
            return await this.db.transaction(async m => {
                const network = await m.getRepository(NetworkEntity).save(m.create(NetworkEntity, {
                    name: dto.name,
                    status: 'active',
                    defaultCurrency: dto.defaultCurrency ?? 'LKR',
                    timeZone: dto.timeZone ?? 'Asia/Colombo',
                }));
                await this.audit.record({
                    actor: ctx, action: 'network.create', resourceType: 'network', resourceId: network.id,
                    networkId: network.id, details: { name: network.name },
                }, m);
                return network;
            });
        } catch (e) {
            if (isUniqueViolation(e)) throw Errors.conflict('A network with this name already exists', 'NAME_TAKEN');
            throw e;
        }
    }

    async update(ctx: AccessContext, id: string, dto: UpdateNetworkDto): Promise<NetworkEntity> {
        const network = await this.get(ctx, id);
        if (!ctx.canOnNetwork(P.NETWORK_UPDATE, id)) throw Errors.forbidden();
        if (dto.status !== undefined && dto.status !== network.status && !ctx.canOnNetwork(P.NETWORK_SUSPEND, id)) {
            throw Errors.forbidden('Changing network status needs the network.suspend permission');
        }
        if (network.status === 'archived') throw Errors.conflict('Archived networks cannot be changed', 'NETWORK_ARCHIVED');

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of ['name', 'defaultCurrency', 'timeZone', 'status'] as const) {
            if (dto[key] !== undefined && dto[key] !== network[key]) changes[key] = { from: network[key], to: dto[key] };
        }
        if (!Object.keys(changes).length) return network;

        try {
            return await this.db.transaction(async m => {
                Object.assign(network, Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])));
                const saved = await m.getRepository(NetworkEntity).save(network);
                await this.audit.record({
                    actor: ctx, action: changes.status ? 'network.status_change' : 'network.update',
                    resourceType: 'network', resourceId: id, networkId: id, details: { changes },
                }, m);
                return saved;
            });
        } catch (e) {
            if (isUniqueViolation(e)) throw Errors.conflict('A network with this name already exists', 'NAME_TAKEN');
            throw e;
        }
    }

    async listStations(ctx: AccessContext, q: StationListQueryDto): Promise<Page<StationEntity>> {
        const qb = this.db.getRepository(StationEntity).createQueryBuilder('s');
        const scope = ctx.scopeFor(P.STATION_READ);
        if (!scope.all) {
            if (!scope.networkIds.length && !scope.stationIds.length) return toPage([], 0, q);
            qb.andWhere('(s.network_id = ANY(:nets) OR s.id = ANY(:stations))', { nets: scope.networkIds, stations: scope.stationIds });
        }
        if (q.networkId) qb.andWhere('s.network_id = :networkId', { networkId: q.networkId });
        const [items, total] = await qb.orderBy('s.name', 'ASC')
            .skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
        return toPage(items, total, q);
    }

    async getStation(ctx: AccessContext, id: string): Promise<StationEntity> {
        const station = await this.db.getRepository(StationEntity).findOneBy({ id });
        if (!station || !ctx.canOnStation(P.STATION_READ, station.id, station.networkId)) throw Errors.notFound('Station');
        return station;
    }

    async createStation(ctx: AccessContext, dto: CreateStationDto): Promise<StationEntity> {
        // The client names the network; the server still checks it is inside the caller's scope (spec 2.2).
        if (!ctx.canOnNetwork(P.STATION_CREATE, dto.networkId)) throw Errors.notFound('Network');
        const network = await this.db.getRepository(NetworkEntity).findOneBy({ id: dto.networkId });
        if (!network) throw Errors.notFound('Network');
        if (network.status !== 'active') throw Errors.conflict('Stations can only be added to an active network', 'NETWORK_NOT_ACTIVE');
        try {
            return await this.db.transaction(async m => {
                const station = await m.getRepository(StationEntity).save(m.create(StationEntity, {
                    networkId: network.id, name: dto.name, status: 'active',
                }));
                await this.audit.record({
                    actor: ctx, action: 'station.create', resourceType: 'station', resourceId: station.id,
                    networkId: network.id, stationId: station.id, details: { name: station.name },
                }, m);
                return station;
            });
        } catch (e) {
            if (isUniqueViolation(e)) throw Errors.conflict('A station with this name already exists in the network', 'NAME_TAKEN');
            throw e;
        }
    }

    async updateStation(ctx: AccessContext, id: string, dto: UpdateStationDto): Promise<StationEntity> {
        const station = await this.getStation(ctx, id);
        if (!ctx.canOnStation(P.STATION_UPDATE, station.id, station.networkId)) throw Errors.forbidden();
        const network = await this.db.getRepository(NetworkEntity).findOneByOrFail({ id: station.networkId });
        if (network.status === 'archived') throw Errors.conflict('Stations of an archived network cannot be changed', 'NETWORK_ARCHIVED');

        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of STATION_FIELDS) {
            const to = dto[key];
            if (to !== undefined && JSON.stringify(to) !== JSON.stringify(station[key])) changes[key] = { from: station[key], to };
        }
        if (!Object.keys(changes).length) return station;

        // Station Admins lose access to an inactive station, and going public is the network's decision,
        // so only network-level admins change status or visibility (FR ST 004)
        if ((changes.status || changes.publicVisible) && !ctx.canOnNetwork(P.STATION_UPDATE, station.networkId)) {
            throw Errors.forbidden('Only a Network Admin or Super Admin can change the status or app visibility of a station');
        }
        const latitude = 'latitude' in changes ? dto.latitude ?? null : station.latitude;
        const longitude = 'longitude' in changes ? dto.longitude ?? null : station.longitude;
        if ((latitude === null) !== (longitude === null)) {
            throw Errors.badRequest('VALIDATION_FAILED', 'Latitude and longitude must be set together');
        }
        const publicVisible = dto.publicVisible ?? station.publicVisible;
        if (publicVisible && latitude === null) {
            throw Errors.conflict('Add the station location before showing it in the app', 'LOCATION_REQUIRED');
        }

        try {
            return await this.db.transaction(async m => {
                Object.assign(station, Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])));
                const saved = await m.getRepository(StationEntity).save(station);
                await this.audit.record({
                    actor: ctx,
                    action: changes.status ? 'station.status_change' : changes.publicVisible ? 'station.visibility_change' : 'station.update',
                    resourceType: 'station', resourceId: id, networkId: station.networkId, stationId: id, details: { changes },
                }, m);
                return saved;
            });
        } catch (e) {
            if (isUniqueViolation(e)) throw Errors.conflict('A station with this name already exists in the network', 'NAME_TAKEN');
            throw e;
        }
    }
}
