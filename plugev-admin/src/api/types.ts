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

export type NetworkStatus = 'active' | 'suspended' | 'archived';

export interface Network {
    id: string;
    name: string;
    status: NetworkStatus;
    defaultCurrency: string;
    timeZone: string;
    createdAt?: string;
    /** Only in the list (GET /networks). */
    stationCount?: number;
}

export type StationStatus = 'active' | 'inactive';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export interface TimeRange {
    open: string;
    close: string;
}
/** Local times "HH:MM"; "24:00" closes at midnight. A missing or empty day is closed. */
export type OperatingHours = { type: 'always' } | { type: 'weekly'; days: Partial<Record<Weekday, TimeRange[]>> };

export const AMENITIES = ['parking', 'restrooms', 'food', 'wifi', 'shopping', 'lodging', 'waiting_area'] as const;
export type Amenity = (typeof AMENITIES)[number];

export interface Station {
    id: string;
    networkId: string;
    name: string;
    status: StationStatus;
    address?: string | null;
    phone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    /** Null: the network's time zone. */
    timeZone?: string | null;
    operatingHours?: OperatingHours | null;
    amenities?: string[];
    /** Shown in the customer app. */
    publicVisible?: boolean;
    createdAt?: string;
}

export interface StationDetails {
    address: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    timeZone: string | null;
    operatingHours: OperatingHours | null;
    amenities: string[];
}

export type EvseProtocol = 'OCPP_1_6_J' | 'OCPP_1_6_S' | 'OCPP_1_5_S';
export type EquipmentStatus = 'active' | 'disabled';
export type ConnectorType = 'CCS2' | 'CCS1' | 'CHADEMO' | 'TYPE2' | 'TYPE1' | 'GBT';
export const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CHADEMO', 'TYPE2', 'GBT', 'CCS1', 'TYPE1'];
/** The chargers in use have one or two connectors (the API enforces the same). */
export const MAX_CONNECTORS = 2;

/** The last status a charger reported for a connector (OCPP StatusNotification). */
export interface ConnectorLive {
    status: string;
    errorCode: string | null;
    info: string | null;
    vendorErrorCode: string | null;
    statusAt: string;
}

/** What the gateway last reported about a charger. */
export interface EvseLive {
    /** Connected and heard from recently. */
    online: boolean;
    connectionState: 'online' | 'offline';
    /** As the gateway saw it, e.g. ocpp1.5-soap. */
    protocol: string | null;
    lastSeenAt: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    disconnectReason: string | null;
    lastBootAt: string | null;
    reported: { vendor: string | null; model: string | null; serialNumber: string | null; firmwareVersion: string | null };
    /** Connector 0: the charger as a whole. */
    chargerStatus: ConnectorLive | null;
    /** Connector numbers the charger reports that are not registered. */
    unregisteredConnectors: number[];
}

/** One plug (or socket) of a charger: the part that goes into the car. */
export interface Connector {
    id: string;
    evseId: string;
    connectorNumber: number;
    connectorType: ConnectorType;
    currentType: 'AC' | 'DC';
    maxPowerKw: number;
    format: 'cable' | 'socket';
    status: EquipmentStatus;
    /** Printed under the QR code, e.g. K7M3QX-1. */
    qrCode: string;
    /** What the QR code contains. */
    qrUrl: string;
    /** Null until the charger reports a status for it. */
    live?: ConnectorLive | null;
}

export interface ConnectorInput {
    connectorNumber: number;
    connectorType: ConnectorType;
    currentType?: 'AC' | 'DC';
    maxPowerKw: number;
    format?: 'cable' | 'socket';
}

/** A charger (the spec's EVSE; "charger terminal" in the old portal). */
export interface Evse {
    id: string;
    networkId: string;
    stationId: string;
    publicCode: string;
    name: string | null;
    protocol: EvseProtocol;
    protocolIdentity: string;
    vendor: string;
    model: string;
    serialNumber: string | null;
    firmwareVersion: string | null;
    maxPowerKw: number | null;
    status: EquipmentStatus;
    createdAt: string;
    connectors: Connector[];
    /** Null until the charger is first heard from through the gateway. */
    live?: EvseLive | null;
}

export interface EvseInput {
    name: string | null;
    protocol: EvseProtocol;
    protocolIdentity: string;
    vendor: string;
    model: string;
    serialNumber: string | null;
    maxPowerKw: number | null;
}
