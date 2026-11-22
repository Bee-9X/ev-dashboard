import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Errors } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/config';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * The charger gateway is a service, not a user: it sends the shared GATEWAY_API_KEY in X-Gateway-Key.
 * Routes using this guard are @Public() for the user guard. With no key configured the link is off.
 */
@Injectable()
export class GatewayKeyGuard implements CanActivate {
    constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

    canActivate(context: ExecutionContext): boolean {
        if (!this.config.gatewayApiKey) throw Errors.notFound('Route');
        const sent = context.switchToHttp().getRequest<Request>().get('x-gateway-key') ?? '';
        // compare digests so the comparison takes the same time whatever the length
        if (!timingSafeEqual(digest(sent), digest(this.config.gatewayApiKey))) {
            throw Errors.unauthenticated('Gateway key is missing or wrong', 'GATEWAY_KEY_INVALID');
        }
        return true;
    }
}
