import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AccessGuard } from './access/access.guard';
import { AccessModule } from './access/access.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AUTH_RATE_LIMITED } from './auth/rate-limit';
import { APP_CONFIG, AppConfig } from './config/config';
import { AppConfigModule } from './config/config.module';
import { buildDataSourceOptions } from './database/options';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { NetworksModule } from './networks/networks.module';
import { EvsesModule } from './evses/evses.module';
import { ChargingModule } from './charging/charging.module';
import { SessionsModule } from './sessions/sessions.module';
import { CommandsModule } from './commands/commands.module';
import { ChargerSecurityModule } from './charger-security/charger-security.module';
import { UsersModule } from './users/users.module';

export const JWT_ISSUER = 'plugev-api';
export const JWT_AUDIENCE = 'plugev';

@Module({
    imports: [
        AppConfigModule,
        LoggerModule.forRootAsync({
            inject: [APP_CONFIG],
            useFactory: (c: AppConfig) => ({
                pinoHttp: {
                    level: c.logLevel,
                    // Same id as the X-Correlation-Id header (set by correlationMiddleware).
                    genReqId: (req: IncomingMessage) => (req as IncomingMessage & { id?: string }).id ?? randomUUID(),
                    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
                    autoLogging: { ignore: (req: IncomingMessage) => !!req.url?.startsWith('/api/v1/health') },
                    transport: c.nodeEnv === 'development'
                        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:standard' } }
                        : undefined,
                },
            }),
        }),
        TypeOrmModule.forRootAsync({
            inject: [APP_CONFIG],
            useFactory: (c: AppConfig) => buildDataSourceOptions(c),
        }),
        JwtModule.registerAsync({
            global: true,
            inject: [APP_CONFIG],
            useFactory: (c: AppConfig) => ({
                secret: c.jwtAccessSecret,
                signOptions: { algorithm: 'HS256', expiresIn: c.accessTokenTtlSec, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
                verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
            }),
        }),
        ThrottlerModule.forRootAsync({
            inject: [APP_CONFIG],
            useFactory: (c: AppConfig) => ({
                throttlers: [
                    { name: 'default', ttl: 60_000, limit: 600 },
                    {
                        name: 'auth',
                        ttl: 60_000,
                        limit: c.authRateLimitPerMin,
                        skipIf: ctx => !Reflect.getMetadata(AUTH_RATE_LIMITED, ctx.getHandler()),
                    },
                ],
            }),
        }),
        AccessModule,
        AuditModule,
        MailModule,
        AuthModule,
        UsersModule,
        NetworksModule,
        EvsesModule,
        ChargingModule,
        SessionsModule,
        CommandsModule,
        ChargerSecurityModule,
    ],
    controllers: [HealthController],
    providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useExisting: AccessGuard },
    ],
})
export class AppModule {}
