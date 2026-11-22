import { Module } from '@nestjs/common';
import { EvsesController } from './evses.controller';
import { EvsesService } from './evses.service';

@Module({ controllers: [EvsesController], providers: [EvsesService] })
export class EvsesModule {}
