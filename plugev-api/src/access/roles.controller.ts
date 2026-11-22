import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import { RoleEntity } from '../database/entities';
import type { AccessContext } from './access-context';
import { Access, RequirePermissions } from './decorators';
import { P } from './permissions';

class UpdateRolePolicyDto {
    @ApiProperty({ description: 'Require MFA for every user holding this role (FR AUTH 003)' })
    @IsBoolean()
    mfaRequired: boolean;
}

export interface RoleView {
    code: string;
    name: string;
    scopeType: string;
    description: string;
    mfaRequired: boolean;
    permissions: string[];
}

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
    constructor(private readonly db: DataSource, private readonly audit: AuditService) {}

    @Get()
    @RequirePermissions(P.ROLE_ASSIGN)
    async list(): Promise<RoleView[]> {
        return this.db.query(`
            SELECT r.code, r.name, r.scope_type AS "scopeType", r.description, r.mfa_required AS "mfaRequired",
                   coalesce(array_agg(rp.permission_code ORDER BY rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
              FROM roles r LEFT JOIN role_permissions rp ON rp.role_code = r.code
             GROUP BY r.code
             ORDER BY CASE r.scope_type WHEN 'platform' THEN 0 WHEN 'network' THEN 1 WHEN 'station' THEN 2 ELSE 3 END`);
    }

    /** Platform setting: whether a role must use MFA. Super Admin only (platform.configure). */
    @Patch(':code')
    @RequirePermissions(P.PLATFORM_CONFIGURE)
    async updatePolicy(@Access() ctx: AccessContext, @Param('code') code: string, @Body() dto: UpdateRolePolicyDto): Promise<RoleView> {
        const role = await this.db.getRepository(RoleEntity).findOneBy({ code });
        if (!role) throw Errors.notFound('Role');
        if (role.mfaRequired !== dto.mfaRequired) {
            await this.db.transaction(async m => {
                await m.update(RoleEntity, { code }, { mfaRequired: dto.mfaRequired });
                await this.audit.record({
                    actor: ctx, action: 'role.mfa_policy_change', resourceType: 'role', resourceId: code,
                    details: { from: role.mfaRequired, to: dto.mfaRequired },
                }, m);
            });
        }
        return (await this.list()).find(r => r.code === code)!;
    }
}
