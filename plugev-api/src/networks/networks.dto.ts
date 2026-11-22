import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, registerDecorator, ValidationOptions,
} from 'class-validator';
import { PageQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** IANA time zone, e.g. Asia/Colombo (spec 2.3, 8.2: kept for display and tariff calculation). */
function IsTimeZone(options?: ValidationOptions) {
    return (object: object, propertyName: string) => registerDecorator({
        name: 'isTimeZone',
        target: object.constructor,
        propertyName,
        options: { message: `${propertyName} must be an IANA time zone such as Asia/Colombo`, ...options },
        validator: {
            validate(value: unknown) {
                if (typeof value !== 'string' || value.length > 64) return false;
                try {
                    new Intl.DateTimeFormat('en', { timeZone: value });
                    return true;
                } catch {
                    return false;
                }
            },
        },
    });
}

export class CreateNetworkDto {
    @ApiProperty({ example: 'Plug EV Colombo' })
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
    name: string;

    @ApiPropertyOptional({ example: 'LKR', default: 'LKR' })
    @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'defaultCurrency must be an ISO 4217 code such as LKR' })
    defaultCurrency?: string;

    @ApiPropertyOptional({ example: 'Asia/Colombo', default: 'Asia/Colombo' })
    @IsOptional() @IsTimeZone()
    timeZone?: string;
}

export const NETWORK_STATUSES = ['active', 'suspended', 'archived'] as const;

export class UpdateNetworkDto {
    @ApiPropertyOptional()
    @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
    name?: string;

    @ApiPropertyOptional()
    @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'defaultCurrency must be an ISO 4217 code such as LKR' })
    defaultCurrency?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsTimeZone()
    timeZone?: string;

    @ApiPropertyOptional({ enum: NETWORK_STATUSES, description: 'Needs network.suspend' })
    @IsOptional() @IsIn(NETWORK_STATUSES)
    status?: (typeof NETWORK_STATUSES)[number];
}

export class CreateStationDto {
    @ApiProperty()
    @IsUUID()
    networkId: string;

    @ApiProperty({ example: 'Kottawa Kinro' })
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
    name: string;
}

export const STATION_STATUSES = ['active', 'inactive'] as const;

export class UpdateStationDto {
    @ApiPropertyOptional({ example: 'Kottawa Kinro' })
    @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
    name?: string;

    @ApiPropertyOptional({ enum: STATION_STATUSES })
    @IsOptional() @IsIn(STATION_STATUSES)
    status?: (typeof STATION_STATUSES)[number];
}

export class StationListQueryDto extends PageQueryDto {
    @ApiPropertyOptional()
    @IsOptional() @IsUUID()
    networkId?: string;
}
