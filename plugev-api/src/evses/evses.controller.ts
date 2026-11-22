import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { Page } from '../common/pagination';
import { ConnectorInputDto, CreateEvseDto, EvseListQueryDto, UpdateConnectorDto, UpdateEvseDto } from './evses.dto';
import { ConnectorView, EvsesService, EvseView } from './evses.service';

/** Chargers (EVSEs) and connectors, spec 9.2. */
@ApiTags('EVSEs (chargers)')
@ApiBearerAuth()
@Controller('evses')
export class EvsesController {
    constructor(private readonly evses: EvsesService) {}

    @Get()
    @RequirePermissions(P.EVSE_READ)
    list(@Access() ctx: AccessContext, @Query() q: EvseListQueryDto): Promise<Page<EvseView>> {
        return this.evses.list(ctx, q);
    }

    @Post()
    @RequirePermissions(P.EVSE_CREATE)
    create(@Access() ctx: AccessContext, @Body() dto: CreateEvseDto): Promise<EvseView> {
        return this.evses.create(ctx, dto);
    }

    @Get(':evseId')
    @RequirePermissions(P.EVSE_READ)
    get(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string): Promise<EvseView> {
        return this.evses.get(ctx, id);
    }

    @Patch(':evseId')
    @RequirePermissions(P.EVSE_UPDATE)
    update(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: UpdateEvseDto): Promise<EvseView> {
        return this.evses.update(ctx, id, dto);
    }

    @Get(':evseId/connectors')
    @RequirePermissions(P.EVSE_READ)
    async connectors(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string): Promise<ConnectorView[]> {
        return (await this.evses.get(ctx, id)).connectors;
    }

    @Post(':evseId/connectors')
    @RequirePermissions(P.EVSE_UPDATE)
    addConnector(
        @Access() ctx: AccessContext,
        @Param('evseId', ParseUUIDPipe) id: string,
        @Body() dto: ConnectorInputDto,
    ): Promise<EvseView> {
        return this.evses.addConnector(ctx, id, dto);
    }

    @Patch(':evseId/connectors/:connectorId')
    @RequirePermissions(P.EVSE_UPDATE)
    updateConnector(
        @Access() ctx: AccessContext,
        @Param('evseId', ParseUUIDPipe) id: string,
        @Param('connectorId', ParseUUIDPipe) connectorId: string,
        @Body() dto: UpdateConnectorDto,
    ): Promise<EvseView> {
        return this.evses.updateConnector(ctx, id, connectorId, dto);
    }
}
