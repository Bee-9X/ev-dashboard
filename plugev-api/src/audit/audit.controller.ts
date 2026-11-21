import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { Access, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { Page, PageQueryDto, toPage } from '../common/pagination';
import { AuditLogEntity } from '../database/entities';

class AuditQueryDto extends PageQueryDto {
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) action?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) resourceType?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) resourceId?: string;
    @ApiPropertyOptional() @IsOptional() @IsUUID() actorUserId?: string;
    @ApiPropertyOptional() @IsOptional() @IsUUID() networkId?: string;
    @ApiPropertyOptional({ enum: ['success', 'denied', 'failure'] })
    @IsOptional() @IsIn(['success', 'denied', 'failure']) outcome?: string;
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
    constructor(private readonly db: DataSource) {}

    /** Super Admin sees everything; Network Admin sees records of their own network(s). */
    @Get()
    @RequirePermissions(P.AUDIT_READ)
    async list(@Access() ctx: AccessContext, @Query() q: AuditQueryDto): Promise<Page<AuditLogEntity>> {
        const qb = this.db.getRepository(AuditLogEntity).createQueryBuilder('a');
        const scope = ctx.scopeFor(P.AUDIT_READ);
        if (!scope.all) {
            if (scope.networkIds.length === 0) return toPage([], 0, q);
            qb.andWhere('a.network_id IN (:...nets)', { nets: scope.networkIds });
        }
        if (q.action) qb.andWhere('a.action = :action', { action: q.action });
        if (q.resourceType) qb.andWhere('a.resource_type = :rt', { rt: q.resourceType });
        if (q.resourceId) qb.andWhere('a.resource_id = :rid', { rid: q.resourceId });
        if (q.actorUserId) qb.andWhere('a.actor_user_id = :actor', { actor: q.actorUserId });
        if (q.networkId) qb.andWhere('a.network_id = :net', { net: q.networkId });
        if (q.outcome) qb.andWhere('a.outcome = :outcome', { outcome: q.outcome });
        const [items, total] = await qb
            .orderBy('a.occurred_at', 'DESC')
            .skip((q.page - 1) * q.pageSize)
            .take(q.pageSize)
            .getManyAndCount();
        return toPage(items, total, q);
    }
}
