/**
 * Permission catalogue and default role grants (spec 3, 3.1, 3.3).
 * The migration seeds these into the roles / permissions / role_permissions tables; code refers to
 * the constants so typos fail at compile time.
 */

export const P = {
    PLATFORM_CONFIGURE: 'platform.configure',
    NETWORK_CREATE: 'network.create',
    NETWORK_READ: 'network.read',
    NETWORK_UPDATE: 'network.update',
    NETWORK_SUSPEND: 'network.suspend',
    STATION_CREATE: 'station.create',
    STATION_READ: 'station.read',
    STATION_UPDATE: 'station.update',
    EVSE_READ: 'evse.read',
    EVSE_CREATE: 'evse.create',
    EVSE_UPDATE: 'evse.update',
    EVSE_REMOTE_START: 'evse.remote_start',
    EVSE_REMOTE_STOP: 'evse.remote_stop',
    EVSE_RESET: 'evse.reset',
    EVSE_UNLOCK: 'evse.unlock',
    TARIFF_MANAGE: 'tariff.manage',
    SESSION_READ: 'session.read',
    TRANSACTION_READ: 'transaction.read',
    TRANSACTION_REFUND: 'transaction.refund',
    REPORT_EXPORT: 'report.export',
    USER_READ: 'user.read',
    USER_CREATE: 'user.create',
    USER_UPDATE_STATUS: 'user.update_status',
    ROLE_ASSIGN: 'role.assign',
    AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof P)[keyof typeof P];

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
    'platform.configure': 'Change platform wide configuration',
    'network.create': 'Create charging networks',
    'network.read': 'View networks in scope',
    'network.update': 'Edit network details',
    'network.suspend': 'Suspend, reactivate or archive networks',
    'station.create': 'Create stations',
    'station.read': 'View stations in scope',
    'station.update': 'Edit station details',
    'evse.read': 'View EVSEs and connectors',
    'evse.create': 'Register EVSEs',
    'evse.update': 'Edit EVSEs and connectors',
    'evse.remote_start': 'Remote start a charging session',
    'evse.remote_stop': 'Remote stop a charging session',
    'evse.reset': 'Reset a charger',
    'evse.unlock': 'Unlock a connector',
    'tariff.manage': 'Create and change tariffs',
    'session.read': 'View charging sessions',
    'transaction.read': 'View transactions',
    'transaction.refund': 'Refund transactions',
    'report.export': 'Export reports',
    'user.read': 'View users in scope',
    'user.create': 'Invite users',
    'user.update_status': 'Suspend, deactivate or reactivate users',
    'role.assign': 'Assign and remove roles',
    'audit.read': 'View audit logs in scope',
};

export const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    NETWORK_ADMIN: 'NETWORK_ADMIN',
    STATION_ADMIN: 'STATION_ADMIN',
    EV_USER: 'EV_USER',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_DEFINITIONS: Record<RoleCode, {
    name: string; scopeType: 'platform' | 'network' | 'station' | 'self'; description: string; permissions: Permission[];
}> = {
    SUPER_ADMIN: {
        name: 'Super Admin',
        scopeType: 'platform',
        description: 'Platform operator. All networks; privileged actions are audited.',
        permissions: Object.values(P),
    },
    NETWORK_ADMIN: {
        name: 'Network Admin',
        scopeType: 'network',
        description: 'Manages one network: stations, EVSEs, tariffs, Station Admins, sessions and reports.',
        permissions: [
            P.NETWORK_READ, P.NETWORK_UPDATE,
            P.STATION_CREATE, P.STATION_READ, P.STATION_UPDATE,
            P.EVSE_READ, P.EVSE_CREATE, P.EVSE_UPDATE,
            P.EVSE_REMOTE_START, P.EVSE_REMOTE_STOP, P.EVSE_RESET, P.EVSE_UNLOCK,
            P.TARIFF_MANAGE, P.SESSION_READ, P.TRANSACTION_READ, P.REPORT_EXPORT,
            P.USER_READ, P.USER_CREATE, P.USER_UPDATE_STATUS, P.ROLE_ASSIGN, P.AUDIT_READ,
        ],
    },
    STATION_ADMIN: {
        name: 'Station Admin',
        scopeType: 'station',
        description: 'Monitors assigned stations. Remote commands only when explicitly delegated.',
        permissions: [P.STATION_READ, P.STATION_UPDATE, P.EVSE_READ, P.SESSION_READ, P.TRANSACTION_READ],
    },
    EV_USER: {
        name: 'EV User',
        scopeType: 'self',
        description: 'Customer account. Access limited to own profile, sessions and transactions.',
        permissions: [],
    },
};
