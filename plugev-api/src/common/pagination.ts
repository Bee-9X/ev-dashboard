import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared pagination query (spec 9.1): ?page=1&pageSize=20, pageSize max 100. */
export class PageQueryDto {
    @ApiPropertyOptional({ minimum: 1, default: 1 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page: number = 1;

    @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    pageSize: number = 20;
}

export interface Page<T> {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
}

export const toPage = <T>(items: T[], total: number, q: PageQueryDto): Page<T> =>
    ({ items, page: q.page, pageSize: q.pageSize, total });
