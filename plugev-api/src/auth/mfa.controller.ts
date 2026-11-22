import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, Authenticated } from '../access/decorators';
import { MfaCodeDto } from './auth.dto';
import { MfaService, MfaSetup, MfaStatus } from './mfa.service';
import { AuthRateLimited } from './rate-limit';

/** The signed-in user's own MFA settings. */
@ApiTags('MFA')
@ApiBearerAuth()
@Authenticated()
@Controller('users/me/mfa')
export class MfaController {
    constructor(private readonly mfa: MfaService) {}

    @Get()
    status(@Access() ctx: AccessContext): Promise<MfaStatus> {
        return this.mfa.status(ctx.userId);
    }

    /** Starts setup: scan the otpauth URL as a QR code (or type the secret), then confirm with a code. */
    @Post('setup')
    @HttpCode(200)
    setup(@Access() ctx: AccessContext): Promise<MfaSetup> {
        return this.mfa.startSetup(ctx.userId);
    }

    @Post('confirm')
    @HttpCode(200)
    @AuthRateLimited()
    async confirm(@Access() ctx: AccessContext, @Body() dto: MfaCodeDto): Promise<{ recoveryCodes: string[] }> {
        return { recoveryCodes: await this.mfa.confirmSetup(ctx.userId, dto.code, ctx) };
    }

    /** Replaces all recovery codes. */
    @Post('recovery-codes')
    @HttpCode(200)
    @AuthRateLimited()
    async regenerate(@Access() ctx: AccessContext, @Body() dto: MfaCodeDto): Promise<{ recoveryCodes: string[] }> {
        return { recoveryCodes: await this.mfa.regenerateRecoveryCodes(ctx, dto.code) };
    }

    /** Turns MFA off. Refused while one of the user's roles requires it. */
    @Delete()
    @HttpCode(204)
    @AuthRateLimited()
    async disable(@Access() ctx: AccessContext, @Body() dto: MfaCodeDto): Promise<void> {
        await this.mfa.disable(ctx, dto.code);
    }
}
