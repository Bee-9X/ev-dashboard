import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : trim({ value }));

export class RemoteStartDto {
    @ApiPropertyOptional({ minimum: 1, description: 'Omit to let the charger pick a free connector' })
    @IsOptional() @IsInt() @Min(1) @Max(99)
    connectorNumber?: number;

    @ApiPropertyOptional({
        maxLength: 20,
        description: 'The authorization (RFID card or app token) to start with. Default: the platform tag OCPP_REMOTE_ID_TAG',
    })
    @IsOptional() @Transform(emptyToUndefined) @IsString() @Matches(/^[\x21-\x7e]{1,20}$/, { message: 'idTag must be 1-20 printable characters without spaces' })
    idTag?: string;
}

export class ConnectorCommandDto {
    @ApiProperty({ minimum: 1 })
    @IsInt() @Min(1) @Max(99)
    connectorNumber: number;
}

export class ResetDto {
    @ApiProperty({ enum: ['Soft', 'Hard'], description: 'Soft: restart the software, ending sessions cleanly. Hard: like switching it off and on' })
    @IsIn(['Soft', 'Hard'])
    type: 'Soft' | 'Hard';
}

export class AvailabilityDto {
    @ApiProperty({ minimum: 0, description: '0 = the whole charger' })
    @IsInt() @Min(0) @Max(99)
    connectorNumber: number;

    @ApiProperty({ description: 'false: the charger shows itself out of service (OCPP Inoperative)' })
    @IsBoolean()
    available: boolean;
}

export class GetConfigurationDto {
    @ApiPropertyOptional({ type: [String], description: 'Omit to read every setting' })
    @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(50, { each: true })
    keys?: string[];
}

export class ChangeConfigurationDto {
    @ApiProperty({ example: 'HeartbeatInterval' })
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(50)
    key: string;

    @ApiProperty({ example: '60' })
    @IsString() @MaxLength(500)
    value: string;
}

/** Messages a charger can be asked to send (OCPP 1.6 TriggerMessage). */
export const TRIGGERABLE = [
    'BootNotification', 'DiagnosticsStatusNotification', 'FirmwareStatusNotification', 'Heartbeat', 'MeterValues', 'StatusNotification',
] as const;

export class TriggerMessageDto {
    @ApiProperty({ enum: TRIGGERABLE })
    @IsIn(TRIGGERABLE)
    message: (typeof TRIGGERABLE)[number];

    @ApiPropertyOptional({ minimum: 0 })
    @IsOptional() @IsInt() @Min(0) @Max(99)
    connectorNumber?: number;
}
