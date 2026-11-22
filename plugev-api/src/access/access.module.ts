import { Global, Module } from '@nestjs/common';
import { AccessGuard } from './access.guard';
import { AccessService } from './access.service';
import { RolesController } from './roles.controller';

@Global()
@Module({
    controllers: [RolesController],
    providers: [AccessService, AccessGuard],
    exports: [AccessService, AccessGuard],
})
export class AccessModule {}
