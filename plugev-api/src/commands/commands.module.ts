import { Module } from '@nestjs/common';
import { ChargingModule } from '../charging/charging.module';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({ imports: [ChargingModule], controllers: [CommandsController], providers: [CommandsService] })
export class CommandsModule {}
