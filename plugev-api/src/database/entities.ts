import {
    Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/*
 * Column names are snake_case to match spec 8.1. The schema itself is owned by the SQL migrations
 * (synchronize is always off); these classes only map rows.
 */

export type NetworkStatus = 'active' | 'suspended' | 'archived';

@Entity('networks')
export class NetworkEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column() name: string;
    @Column({ type: 'text' }) status: NetworkStatus;
    @Column({ name: 'default_currency', type: 'char', length: 3 }) defaultCurrency: string;
    @Column({ name: 'time_zone' }) timeZone: string;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export type StationStatus = 'active' | 'inactive';

/** numeric columns come back from pg as strings; expose them as numbers. */
const decimal = {
    to: (v: number | null | undefined) => v,
    from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
};

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Local times "HH:MM" in the station's time zone; "24:00" closes at midnight. A day that is missing or empty is closed. */
export type OperatingHours =
    | { type: 'always' }
    | { type: 'weekly'; days: Partial<Record<Weekday, { open: string; close: string }[]>> };

@Entity('stations')
export class StationEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'network_id', type: 'uuid' }) networkId: string;
    @Column() name: string;
    @Column({ type: 'text' }) status: StationStatus;
    @Column({ type: 'text', nullable: true }) address: string | null;
    @Column({ type: 'text', nullable: true }) phone: string | null;
    @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimal }) latitude: number | null;
    @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true, transformer: decimal }) longitude: number | null;
    /** Null: the network's time zone applies. */
    @Column({ name: 'time_zone', type: 'text', nullable: true }) timeZone: string | null;
    /** Null: not entered yet. */
    @Column({ name: 'operating_hours', type: 'jsonb', nullable: true }) operatingHours: OperatingHours | null;
    @Column({ type: 'text', array: true, default: () => "'{}'" }) amenities: string[];
    /** Shown in the customer app; independent of status (FR ST 004). */
    @Column({ name: 'public_visible', type: 'boolean', default: false }) publicVisible: boolean;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export type EvseProtocol = 'OCPP_1_6_J' | 'OCPP_1_6_S' | 'OCPP_1_5_S';
export type EquipmentStatus = 'active' | 'disabled';

/** A charger (spec: EVSE; old portal: charger terminal; OCPP 1.6: charge point). */
@Entity('evses')
export class EvseEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'network_id', type: 'uuid' }) networkId: string;
    @Column({ name: 'station_id', type: 'uuid' }) stationId: string;
    /** Short public code printed in the QR stickers, e.g. K7M3QX. Never changes. */
    @Column({ name: 'public_code', type: 'text' }) publicCode: string;
    @Column({ type: 'text', nullable: true }) name: string | null;
    @Column({ type: 'text' }) protocol: EvseProtocol;
    /** The identity the charger connects to the gateway with (OCPP charge box id). */
    @Column({ name: 'protocol_identity', type: 'text' }) protocolIdentity: string;
    @Column({ type: 'text' }) vendor: string;
    @Column({ type: 'text' }) model: string;
    @Column({ name: 'serial_number', type: 'text', nullable: true }) serialNumber: string | null;
    @Column({ name: 'firmware_version', type: 'text', nullable: true }) firmwareVersion: string | null;
    @Column({ name: 'max_power_kw', type: 'numeric', precision: 7, scale: 2, nullable: true, transformer: decimal }) maxPowerKw: number | null;
    @Column({ type: 'text' }) status: EquipmentStatus;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export type ConnectorType = 'CCS2' | 'CCS1' | 'CHADEMO' | 'TYPE2' | 'TYPE1' | 'GBT';

/** One plug (or socket) of a charger: the part that goes into the car. */
@Entity('connectors')
export class ConnectorEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'evse_id', type: 'uuid' }) evseId: string;
    /** As the charger numbers it in OCPP: 1, 2... (0 is the charger itself, never a connector). */
    @Column({ name: 'connector_number', type: 'int' }) connectorNumber: number;
    @Column({ name: 'connector_type', type: 'text' }) connectorType: ConnectorType;
    @Column({ name: 'current_type', type: 'text' }) currentType: 'AC' | 'DC';
    @Column({ name: 'max_power_kw', type: 'numeric', precision: 7, scale: 2, transformer: decimal }) maxPowerKw: number;
    @Column({ type: 'text' }) format: 'cable' | 'socket';
    @Column({ type: 'text' }) status: EquipmentStatus;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export type UserStatus = 'invited' | 'active' | 'suspended' | 'deactivated';

@Entity('users')
export class UserEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column() email: string;
    @Column({ type: 'text', nullable: true }) phone: string | null;
    @Column({ name: 'full_name' }) fullName: string;
    @Column({ name: 'password_hash', type: 'text', nullable: true, select: false }) passwordHash: string | null;
    @Column({ type: 'text' }) status: UserStatus;
    @Column({ name: 'failed_login_count', type: 'int', default: 0 }) failedLoginCount: number;
    @Column({ name: 'locked_until', type: 'timestamptz', nullable: true }) lockedUntil: Date | null;
    @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt: Date | null;
    @Column({ name: 'password_changed_at', type: 'timestamptz', nullable: true }) passwordChangedAt: Date | null;
    @Column({ name: 'mfa_enabled', type: 'boolean', default: false }) mfaEnabled: boolean;
    @Column({ name: 'mfa_secret_encrypted', type: 'text', nullable: true, select: false }) mfaSecretEncrypted: string | null;
    @Column({ name: 'mfa_pending_secret_encrypted', type: 'text', nullable: true, select: false }) mfaPendingSecretEncrypted: string | null;
    @Column({ name: 'mfa_last_used_step', type: 'bigint', nullable: true, select: false }) mfaLastUsedStep: string | null;
    @Column({ name: 'mfa_enabled_at', type: 'timestamptz', nullable: true }) mfaEnabledAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export type RoleScope = 'platform' | 'network' | 'station' | 'self';

@Entity('roles')
export class RoleEntity {
    @PrimaryColumn() code: string;
    @Column() name: string;
    @Column({ name: 'scope_type', type: 'text' }) scopeType: RoleScope;
    @Column({ name: 'mfa_required', type: 'boolean', default: false }) mfaRequired: boolean;
    @Column({ type: 'text' }) description: string;
}

@Entity('permissions')
export class PermissionEntity {
    @PrimaryColumn() code: string;
    @Column({ type: 'text' }) description: string;
}

@Entity('user_role_assignments')
export class RoleAssignmentEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'user_id', type: 'uuid' }) userId: string;
    @Column({ name: 'role_code' }) roleCode: string;
    @Column({ name: 'network_id', type: 'uuid', nullable: true }) networkId: string | null;
    @Column({ name: 'station_id', type: 'uuid', nullable: true }) stationId: string | null;
    @Column({ name: 'effective_from', type: 'timestamptz' }) effectiveFrom: Date;
    @Column({ name: 'effective_to', type: 'timestamptz', nullable: true }) effectiveTo: Date | null;
    @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

@Entity('refresh_tokens')
export class RefreshTokenEntity {
    @PrimaryColumn('uuid') id: string;
    @Column({ name: 'user_id', type: 'uuid' }) userId: string;
    @Column({ name: 'family_id', type: 'uuid' }) familyId: string;
    @Column({ name: 'token_hash' }) tokenHash: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
    @Column({ name: 'revoked_reason', type: 'text', nullable: true }) revokedReason: string | null;
    @Column({ name: 'replaced_by', type: 'uuid', nullable: true }) replacedBy: string | null;
    @Column({ name: 'created_ip', type: 'text', nullable: true }) createdIp: string | null;
    @Column({ name: 'user_agent', type: 'text', nullable: true }) userAgent: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

export type AuthTokenPurpose = 'password_reset' | 'invite';

@Entity('auth_tokens')
export class AuthTokenEntity {
    @PrimaryColumn('uuid') id: string;
    @Column({ name: 'user_id', type: 'uuid' }) userId: string;
    @Column({ type: 'text' }) purpose: AuthTokenPurpose;
    @Column({ name: 'token_hash' }) tokenHash: string;
    @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
    @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

export type LoginEventType =
    | 'login_succeeded' | 'login_failed' | 'account_locked' | 'logout' | 'token_refreshed'
    | 'refresh_token_reuse' | 'password_reset_requested' | 'password_reset_completed' | 'invite_accepted'
    | 'mfa_challenge_issued' | 'mfa_failed' | 'mfa_enabled' | 'mfa_disabled' | 'mfa_reset'
    | 'mfa_recovery_code_used' | 'mfa_recovery_codes_regenerated';

@Entity('login_events')
export class LoginEventEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
    @Column({ type: 'text', nullable: true }) email: string | null;
    @Column({ name: 'event_type', type: 'text' }) eventType: LoginEventType;
    @Column({ type: 'text', nullable: true }) reason: string | null;
    @Column({ type: 'text', nullable: true }) ip: string | null;
    @Column({ name: 'user_agent', type: 'text', nullable: true }) userAgent: string | null;
    @Column({ name: 'correlation_id', type: 'text', nullable: true }) correlationId: string | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

export type AuditOutcome = 'success' | 'denied' | 'failure';

@Entity('audit_logs')
export class AuditLogEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'occurred_at', type: 'timestamptz' }) occurredAt: Date;
    @Column({ name: 'actor_user_id', type: 'uuid', nullable: true }) actorUserId: string | null;
    @Column({ name: 'actor_roles', type: 'text', array: true, default: () => "'{}'" }) actorRoles: string[];
    @Column({ name: 'network_id', type: 'uuid', nullable: true }) networkId: string | null;
    @Column({ name: 'station_id', type: 'uuid', nullable: true }) stationId: string | null;
    @Column({ type: 'text' }) action: string;
    @Column({ name: 'resource_type', type: 'text' }) resourceType: string;
    @Column({ name: 'resource_id', type: 'text', nullable: true }) resourceId: string | null;
    @Column({ type: 'text' }) outcome: AuditOutcome;
    @Column({ name: 'correlation_id', type: 'text', nullable: true }) correlationId: string | null;
    @Column({ type: 'text', nullable: true }) ip: string | null;
    @Column({ type: 'jsonb', default: () => "'{}'" }) details: Record<string, unknown>;
}

@Entity('mfa_recovery_codes')
export class MfaRecoveryCodeEntity {
    @PrimaryGeneratedColumn('uuid') id: string;
    @Column({ name: 'user_id', type: 'uuid' }) userId: string;
    @Column({ name: 'code_hash' }) codeHash: string;
    @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null;
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

export const ENTITIES = [
    NetworkEntity, StationEntity, EvseEntity, ConnectorEntity, UserEntity, RoleEntity, PermissionEntity, RoleAssignmentEntity,
    RefreshTokenEntity, AuthTokenEntity, LoginEventEntity, AuditLogEntity, MfaRecoveryCodeEntity,
];
