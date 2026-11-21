import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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

export interface TokenResponse {
    tokenType: 'Bearer';
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshTokenExpiresAt: string;
}

export interface LoginResponse extends TokenResponse {
    user: { id: string; email: string; fullName: string };
}
