import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { currentRequest } from '../common/request-context';
import { LoginEventEntity, LoginEventType } from '../database/entities';

/** Security event log (FR AUTH 005): sign-ins, failures, lockouts, logout, token reuse, resets. */
@Injectable()
export class LoginEventsService {
    constructor(private readonly db: DataSource) {}

    async record(
        eventType: LoginEventType,
        data: { userId?: string | null; email?: string | null; reason?: string | null },
        manager: EntityManager = this.db.manager,
    ): Promise<void> {
        const req = currentRequest();
        await manager.insert(LoginEventEntity, {
            eventType,
            userId: data.userId ?? null,
            email: data.email ?? null,
            reason: data.reason ?? null,
            ip: req?.ip ?? null,
            userAgent: req?.userAgent ?? null,
            correlationId: req?.correlationId ?? null,
        });
    }
}
