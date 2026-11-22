import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { AuditService } from '../audit/audit.service';
import { AppError, Errors } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/config';
import { MfaRecoveryCodeEntity, UserEntity } from '../database/entities';
import { LoginEventsService } from './login-events.service';
import { SecretBox } from './secret-box';
import { base32Encode, generateTotpSecret, otpauthUrl, verifyTotp } from './totp';
import { TokensService } from './tokens.service';

export const RECOVERY_CODE_COUNT = 10;

export interface MfaSetup {
    secret: string; // for manual entry
    otpauthUrl: string; // render as a QR code
}

export interface MfaStatus {
    enabled: boolean;
    required: boolean;
    enabledAt: string | null;
    recoveryCodesRemaining: number;
}

export const invalidMfaCode = () => new AppError(401, 'INVALID_MFA_CODE', 'The verification code is incorrect or has already been used');

/** Recovery codes look like "ABCDE-FGHJK"; case, spaces and dashes are ignored when checking. */
const normalizeRecovery = (code: string) => code.toUpperCase().replace(/[\s-]/g, '');
const hashRecovery = (code: string) => createHash('sha256').update(normalizeRecovery(code)).digest('hex');

/**
 * TOTP multi-factor authentication (FR AUTH 003). Secrets are encrypted at rest; each accepted code
 * moves a per-user step counter forward so a code cannot be used twice.
 */
@Injectable()
export class MfaService {
    private readonly box: SecretBox;

    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        private readonly db: DataSource,
        private readonly events: LoginEventsService,
        private readonly audit: AuditService,
        private readonly tokens: TokensService,
    ) {
        this.box = new SecretBox(config.mfaEncryptionKey);
    }

    /** True when any of the user's active roles requires MFA. */
    async isRequired(userId: string, manager: EntityManager = this.db.manager): Promise<boolean> {
        const [row] = await manager.query(`
            SELECT EXISTS (
                SELECT 1 FROM user_role_assignments a JOIN roles r ON r.code = a.role_code
                 WHERE a.user_id = $1 AND r.mfa_required
                   AND a.effective_from <= now() AND (a.effective_to IS NULL OR a.effective_to > now())
            ) AS required`, [userId]) as { required: boolean }[];
        return row.required;
    }

    async status(userId: string): Promise<MfaStatus> {
        const user = await this.db.getRepository(UserEntity).findOneByOrFail({ id: userId });
        const remaining = await this.db.getRepository(MfaRecoveryCodeEntity).countBy({ userId, usedAt: IsNull() });
        return {
            enabled: user.mfaEnabled,
            required: await this.isRequired(userId),
            enabledAt: user.mfaEnabledAt ? user.mfaEnabledAt.toISOString() : null,
            recoveryCodesRemaining: user.mfaEnabled ? remaining : 0,
        };
    }

    /** Starts (or restarts) enrolment with a fresh secret. Nothing changes until it is confirmed with a code. */
    async startSetup(userId: string): Promise<MfaSetup> {
        const user = await this.db.getRepository(UserEntity).findOneByOrFail({ id: userId });
        if (user.mfaEnabled) throw Errors.conflict('MFA is already enabled. Reset or disable it first.', 'MFA_ALREADY_ENABLED');
        const secret = generateTotpSecret();
        await this.db.getRepository(UserEntity).update({ id: userId }, { mfaPendingSecretEncrypted: this.box.seal(secret) });
        return { secret, otpauthUrl: otpauthUrl(secret, user.email, this.config.mfaIssuer) };
    }

    /** Confirms enrolment with a code from the app; returns the recovery codes (shown once). */
    async confirmSetup(userId: string, code: string, actor: AccessContext | null): Promise<string[]> {
        return this.db.transaction(async m => {
            const user = await m.getRepository(UserEntity).createQueryBuilder('u')
                .addSelect('u.mfaPendingSecretEncrypted')
                .where('u.id = :id', { id: userId })
                .setLock('pessimistic_write')
                .getOneOrFail();
            if (user.mfaEnabled) throw Errors.conflict('MFA is already enabled', 'MFA_ALREADY_ENABLED');
            if (!user.mfaPendingSecretEncrypted) throw Errors.conflict('Start MFA setup first', 'MFA_SETUP_NOT_STARTED');

            const secret = this.box.open(user.mfaPendingSecretEncrypted);
            const step = verifyTotp(secret, code);
            if (step === null) throw invalidMfaCode();

            await m.update(UserEntity, { id: userId }, {
                mfaEnabled: true,
                mfaSecretEncrypted: user.mfaPendingSecretEncrypted,
                mfaPendingSecretEncrypted: null,
                mfaLastUsedStep: String(step),
                mfaEnabledAt: new Date(),
            });
            const codes = await this.replaceRecoveryCodes(userId, m);
            await this.events.record('mfa_enabled', { userId, email: user.email }, m);
            await this.audit.record({ actor: actor ?? { userId }, action: 'user.mfa_enabled', resourceType: 'user', resourceId: userId }, m);
            return codes;
        });
    }

    /** Checks an authenticator code for an enrolled user, rejecting replays. */
    async verifyCode(userId: string, code: string): Promise<boolean> {
        const user = await this.db.getRepository(UserEntity).createQueryBuilder('u')
            .addSelect('u.mfaSecretEncrypted')
            .where('u.id = :id', { id: userId })
            .getOne();
        if (!user?.mfaEnabled || !user.mfaSecretEncrypted) return false;
        const step = verifyTotp(this.box.open(user.mfaSecretEncrypted), code);
        if (step === null) return false;
        // Accept only a step later than the last one used (atomic, so parallel requests cannot both pass).
        const res = await this.db.query(
            `UPDATE users SET mfa_last_used_step = $2
              WHERE id = $1 AND (mfa_last_used_step IS NULL OR mfa_last_used_step < $2)`, [userId, step],
        ) as [unknown[], number];
        return res[1] === 1;
    }

    /** Consumes a recovery code. Each code works once. */
    async useRecoveryCode(userId: string, code: string): Promise<boolean> {
        if (typeof code !== 'string' || normalizeRecovery(code).length !== 10) return false;
        const res = await this.db.getRepository(MfaRecoveryCodeEntity).update(
            { userId, codeHash: hashRecovery(code), usedAt: IsNull() }, { usedAt: new Date() },
        );
        if (!res.affected) return false;
        await this.events.record('mfa_recovery_code_used', { userId });
        await this.audit.record({ actor: { userId }, action: 'user.mfa_recovery_code_used', resourceType: 'user', resourceId: userId });
        return true;
    }

    /** New set of recovery codes; the old ones stop working. Requires a current authenticator code. */
    async regenerateRecoveryCodes(ctx: AccessContext, code: string): Promise<string[]> {
        if (!(await this.verifyCode(ctx.userId, code))) throw invalidMfaCode();
        return this.db.transaction(async m => {
            const codes = await this.replaceRecoveryCodes(ctx.userId, m);
            await this.events.record('mfa_recovery_codes_regenerated', { userId: ctx.userId }, m);
            await this.audit.record({ actor: ctx, action: 'user.mfa_recovery_codes_regenerated', resourceType: 'user', resourceId: ctx.userId }, m);
            return codes;
        });
    }

    /** The user turns MFA off for themselves. Not allowed while one of their roles requires it. */
    async disable(ctx: AccessContext, code: string): Promise<void> {
        if (await this.isRequired(ctx.userId)) {
            throw Errors.conflict('Your role requires MFA, so it cannot be turned off', 'MFA_REQUIRED_BY_ROLE');
        }
        if (!(await this.verifyCode(ctx.userId, code))) throw invalidMfaCode();
        await this.db.transaction(async m => {
            await this.clear(ctx.userId, m);
            await this.events.record('mfa_disabled', { userId: ctx.userId }, m);
            await this.audit.record({ actor: ctx, action: 'user.mfa_disabled', resourceType: 'user', resourceId: ctx.userId }, m);
        });
    }

    /**
     * An administrator removes a user's MFA (lost phone and no recovery codes). All sessions end; if a
     * role requires MFA the user must enrol again at the next login. Access rules are checked by the caller.
     */
    async reset(actor: AccessContext, userId: string, reason: string): Promise<void> {
        await this.db.transaction(async m => {
            await this.clear(userId, m);
            await this.tokens.revokeAllForUser(userId, 'mfa_reset', m);
            await this.events.record('mfa_reset', { userId, reason: `by ${actor.userId}` }, m);
            await this.audit.record({
                actor, action: 'user.mfa_reset', resourceType: 'user', resourceId: userId, details: { reason },
            }, m);
        });
    }

    private async clear(userId: string, m: EntityManager): Promise<void> {
        await m.update(UserEntity, { id: userId }, {
            mfaEnabled: false, mfaSecretEncrypted: null, mfaPendingSecretEncrypted: null, mfaLastUsedStep: null, mfaEnabledAt: null,
        });
        await m.delete(MfaRecoveryCodeEntity, { userId });
    }

    private async replaceRecoveryCodes(userId: string, m: EntityManager): Promise<string[]> {
        await m.delete(MfaRecoveryCodeEntity, { userId });
        const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
            const raw = base32Encode(randomBytes(7)).slice(0, 10); // ~50 bits each
            return `${raw.slice(0, 5)}-${raw.slice(5)}`;
        });
        await m.insert(MfaRecoveryCodeEntity, codes.map(c => ({ userId, codeHash: hashRecovery(c) })));
        return codes;
    }
}
