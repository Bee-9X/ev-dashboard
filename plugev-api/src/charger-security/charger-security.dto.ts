import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CHARGER_PASSWORD, CHARGER_PASSWORD_RULE, MAX_ALLOWED_ADDRESSES } from '../charging/charger-credentials';

export class SetChargerPasswordDto {
    @ApiPropertyOptional({
        description: `Leave out to have one made (24 random letters and digits). Give one only when the charger has a fixed password: ${CHARGER_PASSWORD_RULE}.`,
    })
    @IsOptional() @IsString() @Matches(CHARGER_PASSWORD, { message: `password must be ${CHARGER_PASSWORD_RULE}` })
    password?: string;
}

export class SetAllowedAddressesDto {
    @ApiProperty({
        type: [String], example: ['203.0.113.7', '198.51.100.0/24'],
        description: `IPv4 or IPv6 addresses or CIDR ranges the charger may connect from; empty = from anywhere. At most ${MAX_ALLOWED_ADDRESSES}.`,
    })
    @IsArray() @ArrayMaxSize(MAX_ALLOWED_ADDRESSES) @IsString({ each: true }) @MaxLength(60, { each: true })
    addresses: string[];
}
