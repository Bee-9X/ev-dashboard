import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export class LoginDto {
    @ApiProperty({ example: 'admin@plugev.lk' })
    @Transform(lowerTrim) @IsEmail() @MaxLength(254)
    email: string;

    @ApiProperty()
    @IsString() @MinLength(1) @MaxLength(PASSWORD_MAX)
    password: string;
}

export class RefreshDto {
    @ApiProperty()
    @IsString() @MaxLength(200)
    refreshToken: string;
}

export class PasswordResetRequestDto {
    @ApiProperty()
    @Transform(lowerTrim) @IsEmail() @MaxLength(254)
    email: string;
}

export class PasswordResetConfirmDto {
    @ApiProperty({ description: 'Token from the reset or invitation link' })
    @IsString() @MaxLength(200)
    token: string;

    @ApiProperty({ minLength: PASSWORD_MIN, maxLength: PASSWORD_MAX })
    @IsString() @MinLength(PASSWORD_MIN) @MaxLength(PASSWORD_MAX)
    newPassword: string;
}

export class MfaTokenDto {
    @ApiProperty({ description: 'mfaToken from the login response' })
    @IsString() @MaxLength(2000)
    mfaToken: string;
}

export class MfaCodeDto {
    @ApiProperty({ example: '123456', description: '6-digit code from the authenticator app' })
    @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
    code: string;
}

export class MfaVerifyDto extends MfaTokenDto {
    @ApiProperty({ required: false, example: '123456' })
    @IsOptional() @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
    code?: string;

    @ApiProperty({ required: false, example: 'ABCDE-FGHJK', description: 'Instead of a code, one unused recovery code' })
    @IsOptional() @IsString() @MaxLength(20)
    recoveryCode?: string;
}

export class MfaEnrollConfirmDto extends MfaTokenDto {
    @ApiProperty({ example: '123456' })
    @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
    code: string;
}

export interface TokenResponse {
    tokenType: 'Bearer';
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshTokenExpiresAt: string;
}

export interface LoginResponse extends TokenResponse {
    status: 'authenticated';
    user: { id: string; email: string; fullName: string };
}

/**
 * Password accepted, second step needed:
 *   mfa_required            -> POST /auth/mfa/verify with a code or recovery code
 *   mfa_enrollment_required -> the role requires MFA and none is set up: POST /auth/mfa/enroll, then /enroll/confirm
 */
export interface MfaPendingResponse {
    status: 'mfa_required' | 'mfa_enrollment_required';
    mfaToken: string;
    mfaTokenExpiresIn: number;
}

export interface EnrolledLoginResponse extends LoginResponse {
    recoveryCodes: string[];
}
