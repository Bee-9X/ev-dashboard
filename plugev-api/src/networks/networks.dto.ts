import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
    registerDecorator, ValidateIf, ValidationOptions,
} from 'class-validator';
import { OperatingHours, Weekday, WEEKDAYS } from '../database/entities';
import { PageQueryDto } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** IANA time zone, e.g. Asia/Colombo (spec 2.3, 8.2: kept for display and tariff calculation). */
export function IsTimeZone(options?: ValidationOptions) {
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

export const AMENITIES = ['parking', 'restrooms', 'food', 'wifi', 'shopping', 'lodging', 'waiting_area'] as const;

/** Trims text; an empty value clears the field. */
const trimOrNull = ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Checks the OperatingHours shape: { type: 'always' } or { type: 'weekly', days: { mon: [{ open, close }], ... } }. */
export function isOperatingHours(value: unknown): value is OperatingHours {
    if (!value || typeof value !== 'object') return false;
    const v = value as { type?: unknown; days?: unknown };
    if (v.type === 'always') return Object.keys(v).length === 1;
    if (v.type !== 'weekly' || !v.days || typeof v.days !== 'object' || Array.isArray(v.days)) return false;
    if (Object.keys(v).length !== 2) return false;
    for (const [day, ranges] of Object.entries(v.days as Record<string, unknown>)) {
        if (!WEEKDAYS.includes(day as Weekday) || !Array.isArray(ranges) || ranges.length > 4) return false;
        let lastClose = '00:00';
        for (const r of ranges as unknown[]) {
            if (!r || typeof r !== 'object') return false;
            const { open, close, ...rest } = r as Record<string, unknown>;
            if (Object.keys(rest).length) return false;
            if (typeof open !== 'string' || typeof close !== 'string' || !TIME.test(open) || !TIME.test(close)) return false;
            // ranges in order, within the day (overnight hours: until 24:00, then from 00:00 the next day)
            if (open >= close || open < lastClose || open === '24:00') return false;
            lastClose = close;
        }
    }
    return true;
}

function IsOperatingHours(options?: ValidationOptions) {
    return (object: object, propertyName: string) => registerDecorator({
        name: 'isOperatingHours',
        target: object.constructor,
        propertyName,
        options: {
            message: `${propertyName} must be {"type":"always"} or {"type":"weekly","days":{"mon":[{"open":"06:00","close":"22:00"}],...}} with times in order`,
            ...options,
        },
        validator: { validate: isOperatingHours },
    });
}

/** Required fields cannot be cleared: null fails validation instead of being skipped. */
const notNull = (_: object, v: unknown) => v !== undefined;

export class UpdateStationDto {
    @ApiPropertyOptional({ example: 'Kottawa Kinro' })
    @ValidateIf(notNull) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
    name?: string;

    @ApiPropertyOptional({ enum: STATION_STATUSES, description: 'Network Admin or Super Admin only' })
    @ValidateIf(notNull) @IsIn(STATION_STATUSES)
    status?: (typeof STATION_STATUSES)[number];

    @ApiPropertyOptional({ nullable: true, example: '120 High Level Road, Kottawa' })
    @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(500)
    address?: string | null;

    @ApiPropertyOptional({ nullable: true, example: '+94 11 234 5678' })
    @IsOptional() @Transform(trimOrNull) @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'phone must be a phone number' })
    phone?: string | null;

    @ApiPropertyOptional({ nullable: true, example: 6.8412, description: 'Set together with longitude' })
    @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90)
    latitude?: number | null;

    @ApiPropertyOptional({ nullable: true, example: 79.9654 })
    @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180)
    longitude?: number | null;

    @ApiPropertyOptional({ nullable: true, description: "Null: the network's time zone" })
    @IsOptional() @IsTimeZone()
    timeZone?: string | null;

    @ApiPropertyOptional({ nullable: true, description: 'Local opening hours (FR ST 005)' })
    @IsOptional() @IsOperatingHours()
    operatingHours?: OperatingHours | null;

    @ApiPropertyOptional({ enum: AMENITIES, isArray: true })
    @ValidateIf(notNull) @IsArray() @ArrayMaxSize(AMENITIES.length) @IsIn(AMENITIES, { each: true })
    amenities?: string[];

    @ApiPropertyOptional({ description: 'Shown in the customer app. Needs a location. Network Admin or Super Admin only' })
    @ValidateIf(notNull) @IsBoolean()
    publicVisible?: boolean;
}

export class StationListQueryDto extends PageQueryDto {
    @ApiPropertyOptional()
    @IsOptional() @IsUUID()
    networkId?: string;
}
