import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { Page, PageQueryDto } from '../common/pagination';
import { NetworkEntity, StationEntity } from '../database/entities';
import { CreateNetworkDto, CreateStationDto, StationListQueryDto, UpdateNetworkDto, UpdateStationDto } from './networks.dto';
import { NetworksService, NetworkWithCount } from './networks.service';

@ApiTags('Networks')
@ApiBearerAuth()
@Controller('networks')
export class NetworksController {
    constructor(private readonly networks: NetworksService) {}

    @Get()
    @RequirePermissions(P.NETWORK_READ)
    list(@Access() ctx: AccessContext, @Query() q: PageQueryDto): Promise<Page<NetworkWithCount>> {
        return this.networks.list(ctx, q);
    }

    @Post()
    @RequirePermissions(P.NETWORK_CREATE)
    create(@Access() ctx: AccessContext, @Body() dto: CreateNetworkDto): Promise<NetworkEntity> {
        return this.networks.create(ctx, dto);
    }

    @Get(':networkId')
    @RequirePermissions(P.NETWORK_READ)
    get(@Access() ctx: AccessContext, @Param('networkId', ParseUUIDPipe) id: string): Promise<NetworkEntity> {
        return this.networks.get(ctx, id);
    }

    @Patch(':networkId')
    @RequirePermissions(P.NETWORK_UPDATE)
    update(
        @Access() ctx: AccessContext,
        @Param('networkId', ParseUUIDPipe) id: string,
        @Body() dto: UpdateNetworkDto,
    ): Promise<NetworkEntity> {
        return this.networks.update(ctx, id, dto);
    }
}

@ApiTags('Stations')
@ApiBearerAuth()
@Controller('stations')
export class StationsController {
    constructor(private readonly networks: NetworksService) {}

    @Get()
    @RequirePermissions(P.STATION_READ)
    list(@Access() ctx: AccessContext, @Query() q: StationListQueryDto): Promise<Page<StationEntity>> {
        return this.networks.listStations(ctx, q);
    }

    @Post()
    @RequirePermissions(P.STATION_CREATE)
    create(@Access() ctx: AccessContext, @Body() dto: CreateStationDto): Promise<StationEntity> {
        return this.networks.createStation(ctx, dto);
    }

    @Get(':stationId')
    @RequirePermissions(P.STATION_READ)
    get(@Access() ctx: AccessContext, @Param('stationId', ParseUUIDPipe) id: string): Promise<StationEntity> {
        return this.networks.getStation(ctx, id);
    }

    @Patch(':stationId')
    @RequirePermissions(P.STATION_UPDATE)
    update(
        @Access() ctx: AccessContext,
        @Param('stationId', ParseUUIDPipe) id: string,
        @Body() dto: UpdateStationDto,
    ): Promise<StationEntity> {
        return this.networks.updateStation(ctx, id, dto);
    }
}
