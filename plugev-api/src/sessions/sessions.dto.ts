import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../common/pagination';

/**
 * active: charging now. completed: stopped normally. interrupted: a new start on the connector came before the stop
 * (the stop was missed). orphan: a stop for a transaction this platform never started (FR SES 007).
 */
export const SESSION_STATUSES = ['active', 'completed', 'interrupted', 'orphan'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export class SessionListQueryDto extends PageQueryDto {
    @ApiPropertyOptional()
    @IsOptional() @IsUUID()
    networkId?: string;

    @ApiPropertyOptional()
    @IsOptional() @IsUUID()
    stationId?: string;

    @ApiPropertyOptional({ description: 'Charger (EVSE) id' })
    @IsOptional() @IsUUID()
    evseId?: string;

    @ApiPropertyOptional({ enum: SESSION_STATUSES })
    @IsOptional() @IsIn(SESSION_STATUSES)
    status?: SessionStatus;

    @ApiPropertyOptional({ description: 'Sessions that started (or, without a start, stopped) at or after this time' })
    @IsOptional() @IsISO8601()
    from?: string;

    @ApiPropertyOptional({ description: 'Sessions that started (or, without a start, stopped) before this time' })
    @IsOptional() @IsISO8601()
    to?: string;
}
