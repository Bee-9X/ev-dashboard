import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AccessContext } from '../access/access-context';
import { Access, Authenticated, RequirePermissions } from '../access/decorators';
import { P } from '../access/permissions';
import { Page } from '../common/pagination';
import {
    InviteUserDto, MeView, RoleTargetDto, UpdateUserStatusDto, UserListQueryDto, UserView,
} from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) {}

    /** The signed-in user, their role assignments and effective permissions. */
    @Get('me')
    @Authenticated()
    me(@Access() ctx: AccessContext): Promise<MeView> {
        return this.users.me(ctx);
    }

    @Get()
    @RequirePermissions(P.USER_READ)
    list(@Access() ctx: AccessContext, @Query() q: UserListQueryDto): Promise<Page<UserView>> {
        return this.users.list(ctx, q);
    }

    /** Invites an administrator with one role. The user sets a password through the emailed link. */
    @Post()
    @RequirePermissions(P.USER_CREATE, P.ROLE_ASSIGN)
    invite(@Access() ctx: AccessContext, @Body() dto: InviteUserDto): Promise<UserView> {
        return this.users.invite(ctx, dto);
    }

    @Get(':userId')
    @RequirePermissions(P.USER_READ)
    get(@Access() ctx: AccessContext, @Param('userId', ParseUUIDPipe) userId: string): Promise<UserView> {
        return this.users.get(ctx, userId);
    }

    @Patch(':userId/status')
    @RequirePermissions(P.USER_UPDATE_STATUS)
    updateStatus(
        @Access() ctx: AccessContext,
        @Param('userId', ParseUUIDPipe) userId: string,
        @Body() dto: UpdateUserStatusDto,
    ): Promise<UserView> {
        return this.users.updateStatus(ctx, userId, dto);
    }

    @Post(':userId/roles')
    @RequirePermissions(P.ROLE_ASSIGN)
    assignRole(
        @Access() ctx: AccessContext,
        @Param('userId', ParseUUIDPipe) userId: string,
        @Body() dto: RoleTargetDto,
    ): Promise<UserView> {
        return this.users.assignRole(ctx, userId, dto);
    }

    @Delete(':userId/roles/:assignmentId')
    @RequirePermissions(P.ROLE_ASSIGN)
    revokeRole(
        @Access() ctx: AccessContext,
        @Param('userId', ParseUUIDPipe) userId: string,
        @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    ): Promise<UserView> {
        return this.users.revokeRole(ctx, userId, assignmentId);
    }
}
