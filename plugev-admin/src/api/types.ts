// Shapes returned by plugev-api (see http://localhost:4000/api/docs).

export interface TokenResponse {
    tokenType: 'Bearer';
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    refreshTokenExpiresAt: string;
}

export interface SignedIn extends TokenResponse {
    status: 'authenticated';
    user: { id: string; email: string; fullName: string };
}

export interface MfaPending {
    status: 'mfa_required' | 'mfa_enrollment_required';
    mfaToken: string;
    mfaTokenExpiresIn: number;
}

export type LoginResult = SignedIn | MfaPending;

export interface EnrolledSignIn extends SignedIn {
    recoveryCodes: string[];
}

export interface MfaSetup {
    secret: string;
    otpauthUrl: string;
}

export interface MfaStatus {
    enabled: boolean;
    required: boolean;
    enabledAt: string | null;
    recoveryCodesRemaining: number;
}

export interface RoleAssignment {
    assignmentId: string;
    role: string;
    networkId: string | null;
    stationId: string | null;
    effectiveFrom: string;
}

export interface Me {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    status: string;
    mfaEnabled: boolean;
    mfaRequired: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    roles: RoleAssignment[];
    permissions: string[];
}

/** Body of every API error: {error:{code,message,correlationId,details?}} */
export interface ApiErrorBody {
    error: { code: string; message: string; correlationId?: string; details?: unknown };
}

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    NETWORK_ADMIN: 'Network Admin',
    STATION_ADMIN: 'Station Admin',
    EV_USER: 'EV User',
};

export interface Page<T> {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
}

export type UserStatus = 'invited' | 'active' | 'suspended' | 'deactivated';

/** A user as administrators see it (GET /users, /users/:id). */
export interface UserSummary {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    status: UserStatus;
    mfaEnabled: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    roles: RoleAssignment[];
}

export type AdminRole = 'SUPER_ADMIN' | 'NETWORK_ADMIN' | 'STATION_ADMIN';

export interface RoleTarget {
    role: AdminRole;
    networkId?: string;
    stationId?: string;
}

export interface Network {
    id: string;
    name: string;
    status: string;
    defaultCurrency: string;
    timeZone: string;
}

export interface Station {
    id: string;
    networkId: string;
    name: string;
    status: string;
}
