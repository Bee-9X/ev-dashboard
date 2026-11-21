import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../common/pagination';
import { ROLES } from '../access/permissions';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.NETWORK_ADMIN, ROLES.STATION_ADMIN] as const;

export class RoleTargetDto {
    @ApiProperty({ enum: ADMIN_ROLES })
    @IsIn(ADMIN_ROLES)
    role: (typeof ADMIN_ROLES)[number];

    @ApiPropertyOptional({ description: 'Required for NETWORK_ADMIN' })
    @IsOptional() @IsUUID()
    networkId?: string;

    @ApiPropertyOptional({ description: 'Required for STATION_ADMIN' })
    @IsOptional() @IsUUID()
    stationId?: string;
}

export class InviteUserDto extends RoleTargetDto {
    @ApiProperty()
    @Transform(lowerTrim) @IsEmail() @MaxLength(254)
    email: string;

    @ApiProperty()
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200)
    fullName: string;

    @ApiPropertyOptional({ example: '+94771234567' })
    @IsOptional() @Transform(trim) @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'phone must be a valid phone number' })
    phone?: string;
}

export const MANAGED_STATUSES = ['active', 'suspended', 'deactivated'] as const;

export class UpdateUserStatusDto {
    @ApiProperty({ enum: MANAGED_STATUSES })
    @IsIn(MANAGED_STATUSES)
    status: (typeof MANAGED_STATUSES)[number];

    @ApiProperty({ description: 'Why the change is made; kept in the audit log' })
    @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500)
    reason: string;
}

export class UserListQueryDto extends PageQueryDto {
    @ApiPropertyOptional({ description: 'Matches email or name' })
    @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
    search?: string;

    @ApiPropertyOptional({ enum: ['invited', 'active', 'suspended', 'deactivated'] })
    @IsOptional() @IsIn(['invited', 'active', 'suspended', 'deactivated'])
    status?: string;
}

export interface RoleAssignmentView {
    assignmentId: string;
    role: string;
    networkId: string | null;
    stationId: string | null;
    effectiveFrom: string;
}

export interface UserView {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
    roles: RoleAssignmentView[];
}

export interface MeView extends UserView {
    permissions: string[];
}
