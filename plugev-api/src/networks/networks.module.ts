import { Module } from '@nestjs/common';
import { NetworksController, StationsController } from './networks.controller';
import { NetworksService } from './networks.service';

@Module({ controllers: [NetworksController, StationsController], providers: [NetworksService] })
export class NetworksModule {}
