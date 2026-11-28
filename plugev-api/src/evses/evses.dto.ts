import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Matches, Max,
    MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import type { ConnectorType, EvseProtocol } from '../database/entities';

/** The chargers in use have one or two connectors. The database allows more if that ever changes. */
export const MAX_CONNECTORS = 2;

export const PROTOCOLS: EvseProtocol[] = ['OCPP_1_6_J', 'OCPP_1_6_S', 'OCPP_1_5_S'];
export const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHADEMO', 'TYPE2', 'TYPE1', 'GBT'];
export const EQUIPMENT_STATUSES = ['active', 'disabled'] as const;
/** OCPP charge box identity: it ends up in the charger's OCPP URL, so keep it to URL-safe characters. */
export const PROTOCOL_IDENTITY = /^[A-Za-z0-9._:-]{1,48}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
};
/** Required fields cannot be cleared: null fails validation instead of being skipped. */
const notNull = (_: object, v: unknown) => v !== undefined;
const identityMessage = 'protocolIdentity must be 1-48 letters, digits or . _ : - (the ID the charger connects with)';

export class ConnectorInputDto {
    @ApiProperty({ minimum: 1, maximum: MAX_CONNECTORS, description: 'As the charger numbers it in OCPP' })
    @IsInt() @Min(1) @Max(MAX_CONNECTORS)
    connectorNumber: number;

    @ApiProperty({ enum: CONNECTOR_TYPES })
    @IsIn(CONNECTOR_TYPES)
    connectorType: ConnectorType;

    @ApiPropertyOptional({ enum: ['AC', 'DC'], description: 'Only needed for GBT; the other types are always AC or always DC' })
    @IsOptional() @IsIn(['AC', 'DC'])
    currentType?: 'AC' | 'DC';

    @ApiProperty({ example: 60 })
    @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(1000)
    maxPowerKw: number;

    @ApiPropertyOptional({ enum: ['cable', 'socket'], default: 'cable', description: 'socket: the driver brings the cable (AC only)' })
    @IsOptional() @IsIn(['cable', 'socket'])
    format?: 'cable' | 'socket';
}

export class UpdateConnectorDto {
    @ApiPropertyOptional({ enum: CONNECTOR_TYPES })
    @ValidateIf(notNull) @IsIn(CONNECTOR_TYPES)
    connectorType?: ConnectorType;

    @ApiPropertyOptional({ enum: ['AC', 'DC'] })
    @ValidateIf(notNull) @IsIn(['AC', 'DC'])
    currentType?: 'AC' | 'DC';

    @ApiPropertyOptional()
    @ValidateIf(notNull) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(1000)
    maxPowerKw?: number;

    @ApiPropertyOptional({ enum: ['cable', 'socket'] })
    @ValidateIf(notNull) @IsIn(['cable', 'socket'])
    format?: 'cable' | 'socket';

    @ApiPropertyOptional({ enum: EQUIPMENT_STATUSES, description: 'disabled: not offered for charging; history is kept' })
    @ValidateIf(notNull) @IsIn(EQUIPMENT_STATUSES)
    status?: (typeof EQUIPMENT_STATUSES)[number];
}

export class CreateEvseDto {
    @ApiProperty()
    @IsUUID()
    stationId: string;

    @ApiPropertyOptional({ example: 'Fast charger 1', description: 'A label for admins' })
    @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
    name?: string | null;

    @ApiProperty({ enum: PROTOCOLS })
    @IsIn(PROTOCOLS)
    protocol: EvseProtocol;

    @ApiProperty({ example: 'KTW-01' })
    @Transform(trim) @Matches(PROTOCOL_IDENTITY, { message: identityMessage })
    protocolIdentity: string;

    @ApiProperty({ example: 'SETEC' })
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
    vendor: string;

    @ApiProperty({ example: 'DC60' })
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
    model: string;

    @ApiPropertyOptional()
    @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
    serialNumber?: string | null;

    @ApiPropertyOptional({ example: 60 })
    @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(2000)
    maxPowerKw?: number | null;

    @ApiProperty({ type: [ConnectorInputDto], minItems: 1, maxItems: MAX_CONNECTORS })
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MAX_CONNECTORS) @ValidateNested({ each: true }) @Type(() => ConnectorInputDto)
    connectors: ConnectorInputDto[];
}

export class UpdateEvseDto {
    @ApiPropertyOptional({ description: 'Move to another station of the same network' })
    @ValidateIf(notNull) @IsUUID()
    stationId?: string;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
    name?: string | null;

    @ApiPropertyOptional({ enum: PROTOCOLS })
    @ValidateIf(notNull) @IsIn(PROTOCOLS)
    protocol?: EvseProtocol;

    @ApiPropertyOptional({ description: 'Change it when the charger is replaced: the QR codes stay the same' })
    @ValidateIf(notNull) @Transform(trim) @Matches(PROTOCOL_IDENTITY, { message: identityMessage })
    protocolIdentity?: string;

    @ApiPropertyOptional()
    @ValidateIf(notNull) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
    vendor?: string;

    @ApiPropertyOptional()
    @ValidateIf(notNull) @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
    model?: string;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100)
    serialNumber?: string | null;

    @ApiPropertyOptional({ nullable: true })
    @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.1) @Max(2000)
    maxPowerKw?: number | null;

    @ApiPropertyOptional({ enum: EQUIPMENT_STATUSES, description: 'disabled: not offered for charging; history is kept' })
    @ValidateIf(notNull) @IsIn(EQUIPMENT_STATUSES)
    status?: (typeof EQUIPMENT_STATUSES)[number];

    @ApiPropertyOptional({
        nullable: true, example: 'http://203.0.113.7:8765/',
        description: 'SOAP chargers only: send commands here instead of the address the charger reports, e.g. the public address of its router with port forwarding. Empty or null clears it.',
    })
    @IsOptional() @Transform(trimOrNull)
    @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }, { message: 'commandUrl must be an http:// or https:// address' })
    @MaxLength(500)
    commandUrl?: string | null;
}

export class EvseListQueryDto extends PageQueryDto {
    @ApiPropertyOptional()
    @IsOptional() @IsUUID()
    networkId?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsUUID()
    stationId?: string;
}
