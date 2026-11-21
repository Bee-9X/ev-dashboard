import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, NextFunction, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AppError } from './common/errors';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { correlationMiddleware } from './common/request-context';
import { createValidationPipe } from './common/validation';
import { APP_CONFIG, AppConfig } from './config/config';

export const API_PREFIX = 'api/v1';

/** Options every Nest app instance must be created with (main.ts and tests). */
export const APP_OPTIONS = { bufferLogs: true, bodyParser: false } as const;

/** Shared by main.ts and the tests so both run the exact same HTTP pipeline. */
export function configureApp(app: NestExpressApplication): void {
    const config = app.get<AppConfig>(APP_CONFIG);

    app.useLogger(app.get(Logger));
    app.set('trust proxy', config.trustProxy ? 1 : false);
    app.disable('x-powered-by');
    app.use(correlationMiddleware);
    app.use(json({ limit: '100kb' }));
    app.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
        const type = (err as { type?: string } | null)?.type;
        if (type === 'entity.parse.failed') return next(new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON'));
        if (type === 'entity.too.large') return next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'));
        return next(err);
    });
    app.enableCors({
        origin: config.corsOrigins,
        allowedHeaders: ['authorization', 'content-type', 'x-correlation-id', 'idempotency-key'],
        exposedHeaders: ['x-correlation-id'],
        maxAge: 600,
    });
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    app.enableShutdownHooks();

    const document = SwaggerModule.createDocument(app, new DocumentBuilder()
        .setTitle('PLUG EV API')
        .setDescription('Core platform API (Phase 1): authentication, users and roles, networks, stations, audit.')
        .setVersion('1.0')
        .addBearerAuth()
        .build());
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
}
