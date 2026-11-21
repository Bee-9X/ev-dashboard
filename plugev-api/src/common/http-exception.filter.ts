import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppError } from './errors';
import { currentRequest } from './request-context';

const DEFAULT_CODES: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    422: 'UNPROCESSABLE',
    429: 'RATE_LIMITED',
};

/**
 * One error shape for every response (spec 9.3): machine readable code, message, correlation id and
 * optional field details. Never leaks stack traces or internal details.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('Errors');

    catch(exception: unknown, host: ArgumentsHost): void {
        const http = host.switchToHttp();
        const res = http.getResponse<Response>();
        const req = http.getRequest<Request & { id?: string }>();
        const correlationId = req?.id ?? currentRequest()?.correlationId;

        let status = 500;
        let code = 'INTERNAL_ERROR';
        let message = 'An unexpected error occurred';
        let details: unknown;

        if (exception instanceof AppError) {
            status = exception.getStatus();
            code = exception.code;
            message = exception.message;
            details = exception.details;
        } else if (exception instanceof ThrottlerException) {
            status = 429;
            code = 'RATE_LIMITED';
            message = 'Too many requests. Try again later.';
        } else if (exception instanceof HttpException) {
            status = exception.getStatus();
            code = DEFAULT_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
            const body = exception.getResponse();
            const raw = typeof body === 'string' ? body : (body as { message?: unknown }).message;
            if (status < 500) message = Array.isArray(raw) ? raw.join('; ') : String(raw ?? exception.message);
        } else if (isClientError(exception)) {
            // e.g. body-parser: malformed JSON or body too large
            status = exception.status;
            const parseFailed = exception.type === 'entity.parse.failed';
            code = parseFailed ? 'INVALID_JSON' : DEFAULT_CODES[status] ?? 'BAD_REQUEST';
            message = parseFailed ? 'Request body is not valid JSON' : 'Bad request';
        }

        if (status >= 500) {
            this.logger.error({ err: exception, correlationId }, 'Unhandled error');
        }

        res.status(status).json({ error: { code, message, correlationId, ...(details ? { details } : {}) } });
    }
}

function isClientError(e: unknown): e is { status: number; type?: string } {
    const s = (e as { status?: unknown } | null)?.status;
    return typeof s === 'number' && s >= 400 && s < 500;
}
