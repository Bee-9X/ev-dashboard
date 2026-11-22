import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginEventsService } from './login-events.service';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { TokensService } from './tokens.service';

@Global()
@Module({
    controllers: [AuthController, MfaController],
    providers: [AuthService, PasswordService, TokensService, LoginEventsService, MfaService],
    exports: [PasswordService, TokensService, LoginEventsService, MfaService],
})
export class AuthModule {}
