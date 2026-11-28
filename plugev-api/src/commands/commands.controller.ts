import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { Page, PageQueryDto } from '../common/pagination';
import {
    AvailabilityDto, ChangeConfigurationDto, ConnectorCommandDto, GetConfigurationDto, RemoteStartDto, ResetDto, TriggerMessageDto,
} from './commands.dto';
import { CommandsService, CommandView, ConfigurationView } from './commands.service';

const accepted = 'Recorded and being sent. Poll GET /evses/{id}/commands/{commandId} for the charger\'s answer and confirmation.';

/**
 * Remote commands (spec 9.2 "Commands", 9.4). Each answers 202 with a command id and status "queued" at once; the
 * charger's answer comes later. "accepted" means the charger took the command, not that it physically happened:
 * `confirmation` says whether its later messages showed that.
 */
@ApiTags('Commands')
@ApiBearerAuth()
@Controller('evses/:evseId')
export class CommandsController {
    constructor(private readonly commands: CommandsService) {}

    @Post('commands/remote-start')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_REMOTE_START)
    remoteStart(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: RemoteStartDto): Promise<CommandView> {
        return this.commands.remoteStart(ctx, id, dto);
    }

    @Post('commands/remote-stop')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_REMOTE_STOP)
    remoteStop(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: ConnectorCommandDto): Promise<CommandView> {
        return this.commands.remoteStop(ctx, id, dto);
    }

    @Post('commands/reset')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_RESET)
    reset(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: ResetDto): Promise<CommandView> {
        return this.commands.reset(ctx, id, dto);
    }

    @Post('commands/unlock')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_UNLOCK)
    unlock(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: ConnectorCommandDto): Promise<CommandView> {
        return this.commands.unlock(ctx, id, dto);
    }

    @Post('commands/availability')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_UPDATE)
    availability(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: AvailabilityDto): Promise<CommandView> {
        return this.commands.availability(ctx, id, dto);
    }

    @Post('commands/get-configuration')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_UPDATE)
    getConfiguration(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: GetConfigurationDto): Promise<CommandView> {
        return this.commands.getConfiguration(ctx, id, dto);
    }

    @Post('commands/change-configuration')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_UPDATE)
    changeConfiguration(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: ChangeConfigurationDto): Promise<CommandView> {
        return this.commands.changeConfiguration(ctx, id, dto);
    }

    @Post('commands/trigger-message')
    @HttpCode(202) @ApiAcceptedResponse({ description: accepted })
    @RequirePermissions(P.EVSE_UPDATE)
    triggerMessage(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: TriggerMessageDto): Promise<CommandView> {
        return this.commands.triggerMessage(ctx, id, dto);
    }

    @Get('commands')
    @RequirePermissions(P.EVSE_READ)
    list(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Query() q: PageQueryDto): Promise<Page<CommandView>> {
        return this.commands.list(ctx, id, q);
    }

    @Get('commands/:commandId')
    @RequirePermissions(P.EVSE_READ)
    get(
        @Access() ctx: AccessContext,
        @Param('evseId', ParseUUIDPipe) id: string,
        @Param('commandId', ParseUUIDPipe) commandId: string,
    ): Promise<CommandView> {
        return this.commands.get(ctx, id, commandId);
    }

    @Get('configuration')
    @RequirePermissions(P.EVSE_UPDATE)
    configuration(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string): Promise<ConfigurationView> {
        return this.commands.configuration(ctx, id);
    }
}
