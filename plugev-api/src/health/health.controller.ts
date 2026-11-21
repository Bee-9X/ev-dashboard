import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { Public } from '../access/decorators';

/** Liveness and readiness probes (spec 13.2). */
@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
    constructor(private readonly db: DataSource) {}

    /** The process is up. */
    @Get('live')
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    /** Ready to serve: database reachable and no migrations pending. */
    @Get('ready')
    async ready(@Res({ passthrough: true }) res: Response): Promise<Record<string, string>> {
        let database = 'down';
        let migrations = 'unknown';
        try {
            await this.db.query('SELECT 1');
            database = 'up';
            migrations = (await this.db.showMigrations()) ? 'pending' : 'applied';
        } catch {
            // reported below
        }
        const ok = database === 'up' && migrations === 'applied';
        if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
        return { status: ok ? 'ok' : 'unavailable', database, migrations };
    }
}
