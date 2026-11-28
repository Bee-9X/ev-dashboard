import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
    correlationId: string;
    ip?: string;
    userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentRequest = (): RequestContext | undefined => requestContext.getStore();

// Created when the module loads, so it carries no request's context.
const outsideRequests = new AsyncResource('plugev-background');

/**
 * Starts background work outside the current request's context: ours and nestjs-pino's, which would otherwise attach
 * the whole HTTP request to every log line the work writes, long after the request has been answered.
 */
export function runOutsideRequest(work: () => void): void {
    outsideRequests.runInAsyncScope(work);
}

const VALID_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Accepts a caller supplied X-Correlation-Id (if well formed) or creates one, echoes it on the
 * response and makes it available to logs, audit records and error bodies (spec 9.1, 13.2).
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.get('x-correlation-id');
    const correlationId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
    (req as Request & { id?: string }).id = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    requestContext.run(
        { correlationId, ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) },
        () => next(),
    );
}
