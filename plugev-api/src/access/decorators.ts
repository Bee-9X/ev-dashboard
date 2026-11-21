import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AccessContext } from './access-context';
import type { Permission } from './permissions';

export const IS_PUBLIC = 'access:public';
export const ANY_AUTHENTICATED = 'access:any-authenticated';
export const REQUIRED_PERMISSIONS = 'access:permissions';

/** No authentication (login, health, docs). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Any signed-in, active user (e.g. their own profile). */
export const Authenticated = () => SetMetadata(ANY_AUTHENTICATED, true);

/** Signed-in user holding every listed permission somewhere; resource scope is checked in the service. */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Injects the AccessContext built by the AccessGuard. */
export const Access = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessContext =>
    ctx.switchToHttp().getRequest().access);
