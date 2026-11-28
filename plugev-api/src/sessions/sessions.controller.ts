import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { Page } from '../common/pagination';
import { SessionListQueryDto } from './sessions.dto';
import { SessionDetailView, SessionsService, SessionView } from './sessions.service';

/** Charging sessions, spec 9.2. Starting and stopping from the portal comes with remote commands (Phase 3 step 3). */
@ApiTags('Sessions')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
    constructor(private readonly sessions: SessionsService) {}

    @Get()
    @RequirePermissions(P.SESSION_READ)
    list(@Access() ctx: AccessContext, @Query() q: SessionListQueryDto): Promise<Page<SessionView>> {
        return this.sessions.list(ctx, q);
    }

    @Get(':sessionId')
    @RequirePermissions(P.SESSION_READ)
    get(@Access() ctx: AccessContext, @Param('sessionId', ParseUUIDPipe) id: string): Promise<SessionDetailView> {
        return this.sessions.get(ctx, id);
    }
}
