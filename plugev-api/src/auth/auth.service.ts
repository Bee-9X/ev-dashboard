import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AppError, Errors } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/config';
import { UserEntity } from '../database/entities';
import { MailService } from '../mail/mail.service';
import { EnrolledLoginResponse, LoginResponse, MfaPendingResponse, TokenResponse } from './auth.dto';
import { LoginEventsService } from './login-events.service';
import { invalidMfaCode, MfaService, MfaSetup } from './mfa.service';
import { PasswordService } from './password.service';
import { IssuedRefreshToken, MFA_TOKEN_TTL_SEC, TokensService } from './tokens.service';

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
const locked = () => new AppError(403, 'ACCOUNT_LOCKED', 'Too many failed sign-in attempts. Try again later.');
const inactive = () => new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active. Contact your administrator.');

@Injectable()
export class AuthService {
    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        private readonly db: DataSource,
        private readonly passwords: PasswordService,
        private readonly tokens: TokensService,
        private readonly mfa: MfaService,
        private readonly events: LoginEventsService,
        private readonly audit: AuditService,
        private readonly mail: MailService,
    ) {}

    /**
     * Step 1: password (FR AUTH 001/004/005). Returns tokens, or an mfaToken when a second factor is
     * needed (FR AUTH 003). Failed password and MFA attempts share one lockout counter.
     */
    async login(email: string, password: string): Promise<LoginResponse | MfaPendingResponse> {
        const user = await this.db.getRepository(UserEntity).createQueryBuilder('u')
            .addSelect('u.passwordHash')
            .where('u.email = :email', { email })
            .getOne();

        if (!user) {
            await this.passwords.verify(null, password); // same cost as a real check
            await this.events.record('login_failed', { email, reason: 'unknown_email' });
            throw invalidCredentials();
        }
        if (this.isLocked(user)) {
            await this.events.record('login_failed', { userId: user.id, email, reason: 'locked' });
            throw locked();
        }
        if (!(await this.passwords.verify(user.passwordHash, password))) {
            await this.registerFailure(user, 'bad_password');
            throw invalidCredentials();
        }
        if (user.status !== 'active') {
            await this.events.record('login_failed', { userId: user.id, email, reason: `status_${user.status}` });
            throw inactive();
        }

        if (user.mfaEnabled || await this.mfa.isRequired(user.id)) {
            const purpose = user.mfaEnabled ? 'challenge' : 'enroll';
            await this.events.record('mfa_challenge_issued', { userId: user.id, email, reason: purpose });
            return {
                status: user.mfaEnabled ? 'mfa_required' : 'mfa_enrollment_required',
                mfaToken: await this.tokens.issueMfaToken(user.id, purpose),
                mfaTokenExpiresIn: MFA_TOKEN_TTL_SEC,
            };
        }
        return this.completeLogin(user);
    }

    /** Step 2 for enrolled users: authenticator code or one recovery code. */
    async verifyMfa(mfaToken: string, code?: string, recoveryCode?: string): Promise<LoginResponse> {
        if (!code === !recoveryCode) throw Errors.badRequest('VALIDATION_FAILED', 'Send either code or recoveryCode');
        const user = await this.userForMfaStep(await this.tokens.verifyMfaToken(mfaToken, 'challenge'));
        if (!user.mfaEnabled) throw Errors.unauthenticated('The sign-in step has expired. Sign in again.', 'MFA_TOKEN_INVALID');

        const ok = code ? await this.mfa.verifyCode(user.id, code) : await this.mfa.useRecoveryCode(user.id, recoveryCode!);
        if (!ok) {
            await this.registerFailure(user, code ? 'bad_mfa_code' : 'bad_recovery_code');
            throw invalidMfaCode();
        }
        return this.completeLogin(user);
    }

    /** Step 2 for users whose role requires MFA but who have none yet: get a new secret. */
    async startEnrollment(mfaToken: string): Promise<MfaSetup> {
        const user = await this.userForMfaStep(await this.tokens.verifyMfaToken(mfaToken, 'enroll'));
        return this.mfa.startSetup(user.id);
    }

    /** Confirms enrolment with a code and signs in. Recovery codes are returned once. */
    async confirmEnrollment(mfaToken: string, code: string): Promise<EnrolledLoginResponse> {
        const user = await this.userForMfaStep(await this.tokens.verifyMfaToken(mfaToken, 'enroll'));
        let recoveryCodes: string[];
        try {
            recoveryCodes = await this.mfa.confirmSetup(user.id, code, null);
        } catch (e) {
            if (e instanceof AppError && e.code === 'INVALID_MFA_CODE') await this.registerFailure(user, 'bad_mfa_code');
            throw e;
        }
        return { ...(await this.completeLogin(user)), recoveryCodes };
    }

    /** Rotates the refresh token. Refused if a role now requires MFA that the user has not set up. */
    async refresh(refreshToken: string): Promise<TokenResponse> {
        const { userId, refresh } = await this.tokens.rotate(refreshToken);
        const user = await this.db.getRepository(UserEntity).findOneByOrFail({ id: userId });
        if (!user.mfaEnabled && await this.mfa.isRequired(userId)) {
            await this.tokens.revokeAllForUser(userId, 'mfa_enrollment_required');
            throw Errors.unauthenticated('Your role now requires MFA. Sign in again to set it up.', 'MFA_ENROLLMENT_REQUIRED');
        }
        return this.tokenResponse(userId, refresh);
    }

    /** Ends the session the refresh token belongs to. Always succeeds (idempotent). */
    async logout(refreshToken: string): Promise<void> {
        const userId = await this.tokens.revokeByToken(refreshToken, 'logout');
        if (userId) await this.events.record('logout', { userId });
    }

    /** FR AUTH 002. Always answers the same way so it cannot be used to discover accounts. */
    async requestPasswordReset(email: string): Promise<void> {
        const user = await this.db.getRepository(UserEntity).findOneBy({ email });
        if (!user || user.status !== 'active') {
            await this.events.record('password_reset_requested', { email, reason: user ? `status_${user.status}` : 'unknown_email' });
            return;
        }
        const token = await this.db.transaction(async m => {
            await this.events.record('password_reset_requested', { userId: user.id, email }, m);
            return this.tokens.issueAuthToken(user.id, 'password_reset', m);
        });
        await this.mail.sendPasswordReset(user.email, `${this.config.portalUrl}/reset-password?token=${encodeURIComponent(token)}`);
    }

    /**
     * Sets a new password from a reset or invitation token. An invitation also activates the account.
     * All existing sessions of the user are revoked. MFA is unchanged: a reset does not bypass it.
     */
    async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
        const passwordHash = await this.passwords.hash(newPassword);
        await this.db.transaction(async m => {
            const t = await this.tokens.consumeAuthToken(token, m);
            const user = await m.getRepository(UserEntity).findOne({ where: { id: t.userId }, lock: { mode: 'pessimistic_write' } });
            const expected = t.purpose === 'invite' ? 'invited' : 'active';
            if (!user || user.status !== expected) {
                throw Errors.badRequest('TOKEN_INVALID', 'The link is invalid or has expired. Request a new one.');
            }
            await m.update(UserEntity, { id: user.id }, {
                passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, status: 'active',
            });
            await this.tokens.revokeAllForUser(user.id, 'password_changed', m);
            const invite = t.purpose === 'invite';
            await this.events.record(invite ? 'invite_accepted' : 'password_reset_completed', { userId: user.id, email: user.email }, m);
            await this.audit.record({
                actor: { userId: user.id },
                action: invite ? 'user.invite_accepted' : 'user.password_reset',
                resourceType: 'user',
                resourceId: user.id,
            }, m);
        });
    }

    // ---------------------------------------------------------------- helpers

    private isLocked(user: UserEntity): boolean {
        return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
    }

    /** Re-checks the account between the password and MFA steps (it may have been locked or suspended). */
    private async userForMfaStep(userId: string): Promise<UserEntity> {
        const user = await this.db.getRepository(UserEntity).findOneBy({ id: userId });
        if (!user) throw Errors.unauthenticated('The sign-in step has expired. Sign in again.', 'MFA_TOKEN_INVALID');
        if (this.isLocked(user)) throw locked();
        if (user.status !== 'active') throw inactive();
        return user;
    }

    private async completeLogin(user: UserEntity): Promise<LoginResponse> {
        const refresh = await this.db.transaction(async m => {
            await m.update(UserEntity, { id: user.id }, { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() });
            await this.events.record('login_succeeded', { userId: user.id, email: user.email, reason: user.mfaEnabled ? 'mfa' : null }, m);
            return this.tokens.issueRefreshToken(user.id, undefined, m);
        });
        return {
            status: 'authenticated',
            ...(await this.tokenResponse(user.id, refresh)),
            user: { id: user.id, email: user.email, fullName: user.fullName },
        };
    }

    private async registerFailure(user: UserEntity, reason: 'bad_password' | 'bad_mfa_code' | 'bad_recovery_code'): Promise<void> {
        const max = this.config.loginMaxFailedAttempts;
        await this.db.transaction(async m => {
            const [rows] = await m.query(`
                UPDATE users
                   SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
                       locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
                 WHERE id = $1
             RETURNING locked_until`, [user.id, max, this.config.loginLockMinutes]) as [{ locked_until: Date | null }[], number];
            const lockedNow = rows?.[0]?.locked_until && new Date(rows[0].locked_until).getTime() > Date.now();
            await this.events.record(reason === 'bad_password' ? 'login_failed' : 'mfa_failed', { userId: user.id, email: user.email, reason }, m);
            if (lockedNow) {
                await this.events.record('account_locked', { userId: user.id, email: user.email, reason: `${max} failed attempts` }, m);
                await this.audit.record({
                    actor: null, action: 'user.locked', resourceType: 'user', resourceId: user.id,
                    details: { failedAttempts: max, lockMinutes: this.config.loginLockMinutes, lastFailure: reason },
                }, m);
            }
        });
    }

    private async tokenResponse(userId: string, refresh: IssuedRefreshToken): Promise<TokenResponse> {
        const access = await this.tokens.issueAccessToken(userId);
        return {
            tokenType: 'Bearer',
            accessToken: access.accessToken,
            expiresIn: access.expiresIn,
            refreshToken: refresh.token,
            refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
        };
    }
}
