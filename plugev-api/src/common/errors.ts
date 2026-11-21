import { HttpException } from '@nestjs/common';

export interface FieldError {
    field: string;
    issues: string[];
}

/** Error with a machine readable code. Rendered as { error: { code, message, correlationId, details? } }. */
export class AppError extends HttpException {
    constructor(status: number, readonly code: string, message: string, readonly details?: unknown) {
        super({ code, message, details }, status);
    }
}

export const Errors = {
    badRequest: (code: string, message: string, details?: unknown) => new AppError(400, code, message, details),
    unauthenticated: (message = 'Authentication required', code = 'UNAUTHENTICATED') => new AppError(401, code, message),
    forbidden: (message = 'You do not have permission to perform this action', code = 'FORBIDDEN') =>
        new AppError(403, code, message),
    // Out-of-scope resources are reported as not found so ids from other tenants cannot be probed (spec 11.4).
    notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
    conflict: (message: string, code = 'CONFLICT') => new AppError(409, code, message),
};
