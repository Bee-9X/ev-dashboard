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

/** What the charger last reported to PLUG EV. */
export interface EvseLive {
    /** Connected and heard from recently. */
    online: boolean;
    connectionState: 'online' | 'offline';
    /** The protocol it connects with, e.g. ocpp1.5-soap. */
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
    /** The session charging on it right now; null when nothing is charging. */
    activeSession?: ActiveSession | null;
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
    /** SOAP only: where commands go instead of the address the charger reports. */
    commandUrl?: string | null;
    createdAt: string;
    connectors: Connector[];
    /** Null until the charger is first heard from. */
    live?: EvseLive | null;
}

/** Why the platform last refused a connection from the charger. */
export type ConnectionRefusal = 'address_not_allowed' | 'password_missing' | 'password_wrong' | 'not_secured';

/** How a charger proves itself when it connects (spec 7.5). The password itself is only shown once, when set. */
export interface ChargerSecurity {
    passwordSet: boolean;
    passwordSetAt: string | null;
    /** Addresses or CIDR ranges it may connect from; empty = from anywhere. */
    allowedAddresses: string[];
    /** Has a password or allowed addresses. */
    secured: boolean;
    /** Whether the platform accepts chargers that are not secured (off in production). */
    unsecuredAccepted: boolean;
    /** Where it last connected from. */
    lastAddress: string | null;
    lastRefusal: { at: string; address: string | null; reason: ConnectionRefusal } | null;
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

/** What a session's latest meter readings say. Null where the charger did not report it. */
export interface SessionLive {
    /** Energy delivered so far (latest meter reading minus the meter start). */
    energyWh: number | null;
    powerW: number | null;
    /** Battery state of charge, if the charger reports it. */
    socPercent: number | null;
    /** When the newest reading used was taken. */
    readingAt: string | null;
}

export interface ActiveSession extends SessionLive {
    id: string;
    startedAt: string | null;
}

/**
 * active: charging now. completed: stopped. interrupted: a new start on the connector came before the stop.
 * orphan: a stop for a transaction the platform never started.
 */
export type SessionStatus = 'active' | 'completed' | 'interrupted' | 'orphan';
export const SESSION_STATUSES: SessionStatus[] = ['active', 'completed', 'interrupted', 'orphan'];

/** A charging session, as administrators see it. */
export interface ChargingSession {
    id: string;
    networkId: string;
    networkName: string;
    stationId: string;
    stationName: string;
    evseId: string;
    evseName: string | null;
    protocolIdentity: string;
    connectorNumber: number;
    connectorType: ConnectorType | null;
    /** The transaction id the charger uses. */
    ocppTransactionId: number | null;
    /** The RFID card or app token that started it. */
    idTag: string | null;
    stopIdTag: string | null;
    startedAt: string | null;
    stoppedAt: string | null;
    /** Until now while charging. */
    durationSec: number | null;
    meterStartWh: number | null;
    meterStopWh: number | null;
    /** Final energy from the meter start and stop. */
    energyWh: number | null;
    status: SessionStatus;
    /** As the charger gave it, e.g. EVDisconnected, Local, Remote. */
    stopReason: string | null;
    notes: string[];
    createdAt: string;
    /** Latest readings while charging. */
    live: SessionLive | null;
}

export interface MeterReading {
    measuredAt: string;
    measurand: string;
    phase: string | null;
    unit: string | null;
    value: string;
    numericValue: number | null;
    context: string | null;
    location: string | null;
    source: 'MeterValues' | 'StopTransaction';
}

export interface ChargingSessionDetail extends ChargingSession {
    readings: MeterReading[];
    /** More readings exist than were returned. */
    readingsTruncated: boolean;
}

export interface SessionQuery {
    page?: number;
    pageSize?: number;
    networkId?: string;
    stationId?: string;
    evseId?: string;
    status?: SessionStatus;
}

export type CommandStatus = 'queued' | 'sent' | 'accepted' | 'rejected' | 'failed' | 'timed_out';

/** A remote command and what came of it. "accepted" means the charger took it, not that it physically happened. */
export interface ChargerCommand {
    id: string;
    evseId: string;
    /** The OCPP operation, e.g. RemoteStartTransaction. */
    action: string;
    connectorNumber: number | null;
    payload: Record<string, unknown>;
    status: CommandStatus;
    /** What the charger answered, e.g. Accepted, Rejected, Unlocked, Scheduled. */
    responseStatus: string | null;
    error: string | null;
    requestedBy: { id: string; name: string } | null;
    createdAt: string;
    sentAt: string | null;
    answeredAt: string | null;
    /** Whether the charger's later messages showed it happened. Null when there is nothing to confirm. */
    confirmation: {
        state: 'confirmed' | 'waiting' | 'not_confirmed';
        at: string | null;
        detail: string | null;
        sessionId: string | null;
    } | null;
}

export interface ChargerConfiguration {
    /** Null until read from the charger. */
    readAt: string | null;
    keys: { key: string; value: string | null; readonly: boolean }[];
    unknownKeys: string[];
}
