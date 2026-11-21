import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { currentRequest } from '../common/request-context';
import type { AccessContext } from '../access/access-context';
import { AuditLogEntity, AuditOutcome } from '../database/entities';

export interface AuditEntry {
    actor?: AccessContext | { userId: string | null; roles?: string[] } | null;
    action: string; // e.g. "user.invite", "network.create"
    resourceType: string;
    resourceId?: string | null;
    networkId?: string | null;
    stationId?: string | null;
    outcome?: AuditOutcome;
    details?: Record<string, unknown>;
}

/**
 * Writes the append-only audit trail (spec 3.2, 11.3). Pass the transaction's EntityManager so the
 * audit row commits or rolls back together with the change it describes.
 */
@Injectable()
export class AuditService {
    constructor(private readonly db: DataSource) {}

    async record(entry: AuditEntry, manager: EntityManager = this.db.manager): Promise<void> {
        const req = currentRequest();
        const actor = entry.actor;
        const roles = actor && 'grants' in actor ? actor.roles : actor?.roles ?? [];
        await manager.save(manager.create(AuditLogEntity, {
            occurredAt: new Date(),
            actorUserId: actor?.userId ?? null,
            actorRoles: roles,
            networkId: entry.networkId ?? null,
            stationId: entry.stationId ?? null,
            action: entry.action,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId ?? null,
            outcome: entry.outcome ?? 'success',
            correlationId: req?.correlationId ?? null,
            ip: req?.ip ?? null,
            details: entry.details ?? {},
        }));
    }
}
