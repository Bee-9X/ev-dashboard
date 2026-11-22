import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../access/decorators';
import {
    EnrolledLoginResponse, LoginDto, LoginResponse, MfaEnrollConfirmDto, MfaPendingResponse, MfaTokenDto, MfaVerifyDto,
    PasswordResetConfirmDto, PasswordResetRequestDto, RefreshDto, TokenResponse,
} from './auth.dto';
import { MfaSetup } from './mfa.service';
import { AuthService } from './auth.service';
import { AuthRateLimited } from './rate-limit';

@ApiTags('Authentication')
@Public()
@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Post('login')
    @HttpCode(200)
    @AuthRateLimited()
    login(@Body() dto: LoginDto): Promise<LoginResponse | MfaPendingResponse> {
        return this.auth.login(dto.email, dto.password);
    }

    /** Second step for users with MFA: a code from the authenticator app, or one recovery code. */
    @Post('mfa/verify')
    @HttpCode(200)
    @AuthRateLimited()
    verifyMfa(@Body() dto: MfaVerifyDto): Promise<LoginResponse> {
        return this.auth.verifyMfa(dto.mfaToken, dto.code, dto.recoveryCode);
    }

    /** First login where the role requires MFA: returns a secret / otpauth URL to scan. */
    @Post('mfa/enroll')
    @HttpCode(200)
    @AuthRateLimited()
    startEnrollment(@Body() dto: MfaTokenDto): Promise<MfaSetup> {
        return this.auth.startEnrollment(dto.mfaToken);
    }

    /** Confirms the authenticator with a code, signs in and returns recovery codes (shown once). */
    @Post('mfa/enroll/confirm')
    @HttpCode(200)
    @AuthRateLimited()
    confirmEnrollment(@Body() dto: MfaEnrollConfirmDto): Promise<EnrolledLoginResponse> {
        return this.auth.confirmEnrollment(dto.mfaToken, dto.code);
    }

    /** Rotates the refresh token: the old one stops working, a new pair is returned. */
    @Post('refresh')
    @HttpCode(200)
    @AuthRateLimited()
    refresh(@Body() dto: RefreshDto): Promise<TokenResponse> {
        return this.auth.refresh(dto.refreshToken);
    }

    @Post('logout')
    @HttpCode(204)
    async logout(@Body() dto: RefreshDto): Promise<void> {
        await this.auth.logout(dto.refreshToken);
    }

    /** Always 202, whether or not the email exists. */
    @Post('password/reset')
    @HttpCode(202)
    @AuthRateLimited()
    async requestReset(@Body() dto: PasswordResetRequestDto): Promise<void> {
        await this.auth.requestPasswordReset(dto.email);
    }

    /** Completes a password reset or accepts an invitation (sets the first password). */
    @Post('password/reset/confirm')
    @HttpCode(204)
    @AuthRateLimited()
    async confirmReset(@Body() dto: PasswordResetConfirmDto): Promise<void> {
        await this.auth.confirmPasswordReset(dto.token, dto.newPassword);
    }
}
