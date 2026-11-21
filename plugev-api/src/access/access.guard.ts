import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Errors } from '../common/errors';
import type { AccessContext } from './access-context';
import { AccessService } from './access.service';
import { ANY_AUTHENTICATED, IS_PUBLIC, REQUIRED_PERMISSIONS } from './decorators';

export interface AccessTokenPayload {
    sub: string;
    typ: 'access';
}

/**
 * Global guard, deny by default (spec 3.2):
 *   - @Public() routes are open;
 *   - every other route needs a valid access token for an active account;
 *   - and must declare @RequirePermissions(...) or @Authenticated(); a route with neither is refused.
 */
@Injectable()
export class AccessGuard implements CanActivate {
    private readonly logger = new Logger(AccessGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly jwt: JwtService,
        private readonly access: AccessService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const targets = [context.getHandler(), context.getClass()];
        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

        const req = context.switchToHttp().getRequest<Request & { access?: AccessContext }>();
        const header = req.get('authorization') ?? '';
        const match = /^Bearer\s+(\S+)$/i.exec(header);
        if (!match) throw Errors.unauthenticated();

        let payload: AccessTokenPayload;
        try {
            payload = await this.jwt.verifyAsync<AccessTokenPayload>(match[1]);
        } catch {
            throw Errors.unauthenticated('Access token is invalid or expired', 'TOKEN_INVALID');
        }
        if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
            throw Errors.unauthenticated('Access token is invalid or expired', 'TOKEN_INVALID');
        }

        const ctx = await this.access.load(payload.sub);
        if (!ctx) throw Errors.unauthenticated('Account is not active', 'ACCOUNT_INACTIVE');
        req.access = ctx;

        const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_PERMISSIONS, targets);
        const anyUser = this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED, targets);
        if (!required && !anyUser) {
            this.logger.error(`Route ${req.method} ${req.path} has no access policy; refusing`);
            throw Errors.forbidden();
        }
        if (required && !required.every(p => ctx.has(p))) throw Errors.forbidden();
        return true;
    }
}
