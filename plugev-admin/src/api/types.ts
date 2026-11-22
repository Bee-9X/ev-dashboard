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
