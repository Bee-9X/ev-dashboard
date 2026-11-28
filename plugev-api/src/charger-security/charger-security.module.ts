import { Module } from '@nestjs/common';
import { ChargingModule } from '../charging/charging.module';
import { ChargerSecurityController } from './charger-security.controller';
import { ChargerSecurityService } from './charger-security.service';

@Module({ imports: [ChargingModule], controllers: [ChargerSecurityController], providers: [ChargerSecurityService] })
export class ChargerSecurityModule {}
