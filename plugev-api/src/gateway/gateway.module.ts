import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayKeyGuard } from './gateway-key.guard';
import { GatewayService } from './gateway.service';

@Module({ controllers: [GatewayController], providers: [GatewayService, GatewayKeyGuard], exports: [GatewayService] })
export class GatewayModule {}
