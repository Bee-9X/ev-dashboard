import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { SetAllowedAddressesDto, SetChargerPasswordDto } from './charger-security.dto';
import { ChargerSecurityService, ChargerSecurityView } from './charger-security.service';

/**
 * How a charger proves itself when it connects (spec 7.5). OCPP-J chargers send their password with HTTP Basic
 * authentication (user name = Charger ID); OCPP SOAP chargers usually cannot, so they are limited by address instead.
 */
@ApiTags('EVSEs (chargers)')
@ApiBearerAuth()
@Controller('evses/:evseId/security')
export class ChargerSecurityController {
    constructor(private readonly security: ChargerSecurityService) {}

    @Get()
    @RequirePermissions(P.EVSE_READ)
    get(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string): Promise<ChargerSecurityView> {
        return this.security.get(ctx, id);
    }

    @Post('password')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @ApiOkResponse({ description: 'The new password, shown only in this answer. The old one stops working at once, and an open connection is closed.' })
    @RequirePermissions(P.EVSE_UPDATE)
    setPassword(
        @Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: SetChargerPasswordDto,
    ): Promise<{ password: string; security: ChargerSecurityView }> {
        return this.security.setPassword(ctx, id, dto);
    }

    @Delete('password')
    @RequirePermissions(P.EVSE_UPDATE)
    removePassword(@Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string): Promise<ChargerSecurityView> {
        return this.security.removePassword(ctx, id);
    }

    @Put('allowed-addresses')
    @RequirePermissions(P.EVSE_UPDATE)
    setAllowedAddresses(
        @Access() ctx: AccessContext, @Param('evseId', ParseUUIDPipe) id: string, @Body() dto: SetAllowedAddressesDto,
    ): Promise<ChargerSecurityView> {
        return this.security.setAllowedAddresses(ctx, id, dto);
    }
}
