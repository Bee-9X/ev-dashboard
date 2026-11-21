import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AppError, Errors } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/config';
import { UserEntity } from '../database/entities';
import { MailService } from '../mail/mail.service';
import { LoginResponse, TokenResponse } from './auth.dto';
import { LoginEventsService } from './login-events.service';
import { PasswordService } from './password.service';
import { IssuedRefreshToken, TokensService } from './tokens.service';

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

@Injectable()
export class AuthService {
    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        private readonly db: DataSource,
        private readonly passwords: PasswordService,
        private readonly tokens: TokensService,
        private readonly events: LoginEventsService,
        private readonly audit: AuditService,
        private readonly mail: MailService,
    ) {}

    /** FR AUTH 001/004/005: credential check with lockout; inactive accounts cannot sign in. */
    async login(email: string, password: string): Promise<LoginResponse> {
        const user = await this.db.getRepository(UserEntity).createQueryBuilder('u')
            .addSelect('u.passwordHash')
            .where('u.email = :email', { email })
            .getOne();

        if (!user) {
            await this.passwords.verify(null, password); // same cost as a real check
            await this.events.record('login_failed', { email, reason: 'unknown_email' });
            throw invalidCredentials();
        }

        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
            await this.events.record('login_failed', { userId: user.id, email, reason: 'locked' });
            throw new AppError(403, 'ACCOUNT_LOCKED', 'Too many failed sign-in attempts. Try again later.');
        }

        const ok = await this.passwords.verify(user.passwordHash, password);
        if (!ok) {
            await this.registerFailure(user);
            throw invalidCredentials();
        }

        if (user.status !== 'active') {
            await this.events.record('login_failed', { userId: user.id, email, reason: `status_${user.status}` });
            throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is not active. Contact your administrator.');
        }

        const refresh = await this.db.transaction(async m => {
            await m.update(UserEntity, { id: user.id }, { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() });
            await this.events.record('login_succeeded', { userId: user.id, email }, m);
            return this.tokens.issueRefreshToken(user.id, undefined, m);
        });
        return {
            ...(await this.tokenResponse(user.id, refresh)),
            user: { id: user.id, email: user.email, fullName: user.fullName },
        };
    }

    async refresh(refreshToken: string): Promise<TokenResponse> {
        const { userId, refresh } = await this.tokens.rotate(refreshToken);
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
     * All existing sessions of the user are revoked.
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

    private async registerFailure(user: UserEntity): Promise<void> {
        const max = this.config.loginMaxFailedAttempts;
        await this.db.transaction(async m => {
            const [row] = await m.query(`
                UPDATE users
                   SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
                       locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
                 WHERE id = $1
             RETURNING locked_until`, [user.id, max, this.config.loginLockMinutes]) as [{ locked_until: Date | null }[], number];
            const lockedNow = row?.[0]?.locked_until && new Date(row[0].locked_until).getTime() > Date.now();
            await this.events.record('login_failed', { userId: user.id, email: user.email, reason: 'bad_password' }, m);
            if (lockedNow) {
                await this.events.record('account_locked', { userId: user.id, email: user.email, reason: `${max} failed attempts` }, m);
                await this.audit.record({
                    actor: null, action: 'user.locked', resourceType: 'user', resourceId: user.id,
                    details: { failedAttempts: max, lockMinutes: this.config.loginLockMinutes },
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
