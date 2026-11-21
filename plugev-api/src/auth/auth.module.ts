import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginEventsService } from './login-events.service';
import { PasswordService } from './password.service';
import { TokensService } from './tokens.service';

@Global()
@Module({
    controllers: [AuthController],
    providers: [AuthService, PasswordService, TokensService, LoginEventsService],
    exports: [PasswordService, TokensService, LoginEventsService],
})
export class AuthModule {}
