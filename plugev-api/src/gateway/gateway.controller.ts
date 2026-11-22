import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../access/decorators';
import { GatewayEventsDto, GatewayEventsResult } from './gateway.dto';
import { GatewayKeyGuard } from './gateway-key.guard';
import { GatewayService } from './gateway.service';

/** Service endpoint for the charger gateway (plugev-server). Not for browsers or users. */
@ApiTags('Gateway (service)')
@ApiHeader({ name: 'X-Gateway-Key', required: true, description: 'GATEWAY_API_KEY' })
@Controller('gateway')
@Public()
@UseGuards(GatewayKeyGuard)
export class GatewayController {
    constructor(private readonly gateway: GatewayService) {}

    @Post('events')
    @HttpCode(200)
    events(@Body() dto: GatewayEventsDto): Promise<GatewayEventsResult> {
        return this.gateway.apply(dto.events);
    }
}
