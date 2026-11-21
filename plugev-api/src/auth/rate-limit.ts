import { SetMetadata } from '@nestjs/common';

export const AUTH_RATE_LIMITED = 'rate:auth';

/** Applies the stricter per-IP "auth" throttler (AUTH_RATE_LIMIT_PER_MIN) to a route (spec 11.1). */
export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);
