import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min,
    ValidateNested,
} from 'class-validator';
import { PROTOCOL_IDENTITY } from '../evses/evses.dto';

export const GATEWAY_EVENT_TYPES = ['seen', 'connected', 'disconnected', 'boot', 'connector_status'] as const;
export type GatewayEventType = (typeof GATEWAY_EVENT_TYPES)[number];
export const GATEWAY_PROTOCOLS = ['ocpp1.5-soap', 'ocpp1.6-soap', 'ocpp1.6-json'] as const;

/**
 * One thing the gateway observed about a charger (canonical events, ADR-004/007):
 * - seen: any message arrived;
 * - connected / disconnected: the charger came online or went offline;
 * - boot: BootNotification, with what the charger says about itself;
 * - connector_status: StatusNotification for a connector (0 = the charger itself).
 */
export class GatewayEventDto {
    @ApiPropertyOptional({ description: 'Unique per event; for tracing' })
    @IsOptional() @IsString() @MaxLength(64)
    id?: string;

    @ApiProperty({ enum: GATEWAY_EVENT_TYPES })
    @IsIn(GATEWAY_EVENT_TYPES)
    type: GatewayEventType;

    @ApiProperty({ example: 'c1', description: 'The identity the charger connected with' })
    @Matches(PROTOCOL_IDENTITY)
    identity: string;

    @ApiProperty({ description: 'When the gateway observed it' })
    @IsISO8601()
    at: string;

    @ApiPropertyOptional({ enum: GATEWAY_PROTOCOLS })
    @IsOptional() @IsIn(GATEWAY_PROTOCOLS)
    protocol?: string;

    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;

    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) vendor?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) model?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) serialNumber?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) firmwareVersion?: string;

    @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(99) connectorNumber?: number;
    @ApiPropertyOptional({ example: 'Available' }) @IsOptional() @IsString() @MaxLength(40) status?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) errorCode?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) info?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) vendorErrorCode?: string;
    @ApiPropertyOptional({ description: 'The charger\'s own timestamp for the status' }) @IsOptional() @IsISO8601() statusAt?: string;
}

export class GatewayEventsDto {
    @ApiProperty({ type: [GatewayEventDto], maxItems: 200 })
    @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => GatewayEventDto)
    events: GatewayEventDto[];
}

export interface GatewayEventsResult {
    applied: number;
    /** Identities that are not registered as chargers in the platform. */
    unknownIdentities: string[];
}
