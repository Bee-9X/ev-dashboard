import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppError, FieldError } from './errors';

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
    return errors.flatMap(e => {
        const field = parent ? `${parent}.${e.property}` : e.property;
        const own = e.constraints ? [{ field, issues: Object.values(e.constraints) }] : [];
        return [...own, ...flatten(e.children ?? [], field)];
    });
}

export function createValidationPipe(): ValidationPipe {
    return new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: errors => new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', flatten(errors)),
    });
}
