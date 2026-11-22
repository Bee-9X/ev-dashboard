import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { currentRequest } from '../common/request-context';
import { APP_CONFIG, AppConfig } from '../config/config';
import { inviteMail, MailMessage, passwordResetMail } from './templates';

/**
 * Outgoing email.
 *   MAIL_TRANSPORT=log  (default until a provider is chosen): the whole message, links included, is
 *                       written to the application log instead of being sent.
 *   MAIL_TRANSPORT=smtp: sent through any SMTP service (Amazon SES, Azure Communication Services,
 *                       SendGrid, Brevo, Microsoft 365, ...), configured with the SMTP_* settings.
 *
 * Delivery failures are logged, not thrown: the invitation or reset already exists and the caller's
 * request should not fail because the mail server is down.
 */
@Injectable()
export class MailService implements OnModuleInit {
    private readonly logger = new Logger(MailService.name);
    private readonly smtp: Transporter | null;

    constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
        this.smtp = config.mail.transport === 'smtp'
            ? createTransport({
                host: config.mail.smtp.host,
                port: config.mail.smtp.port,
                secure: config.mail.smtp.secure, // true for port 465; otherwise STARTTLS is used when offered
                requireTLS: config.mail.smtp.requireTls,
                auth: config.mail.smtp.user ? { user: config.mail.smtp.user, pass: config.mail.smtp.password } : undefined,
                connectionTimeout: 10_000,
                greetingTimeout: 10_000,
                socketTimeout: 20_000,
            })
            : null;
    }

    async onModuleInit(): Promise<void> {
        if (!this.smtp) {
            if (this.config.nodeEnv === 'production') {
                this.logger.warn('MAIL_TRANSPORT=log: emails are written to the log, not sent. Configure SMTP before real users are invited.');
            }
            return;
        }
        // Report a wrong host or password at startup rather than at the first invitation; never fatal.
        this.smtp.verify().then(
            () => this.logger.log(`SMTP ready (${this.config.mail.smtp.host}:${this.config.mail.smtp.port})`),
            (err: Error) => this.logger.error(`SMTP check failed for ${this.config.mail.smtp.host}:${this.config.mail.smtp.port}: ${err.message}`),
        );
    }

    async sendInvite(to: string, fullName: string, link: string): Promise<void> {
        await this.send(inviteMail(to, fullName, link, this.config.inviteTtlHours));
    }

    async sendPasswordReset(to: string, link: string): Promise<void> {
        await this.send(passwordResetMail(to, link, this.config.passwordResetTtlMin));
    }

    private async send(mail: MailMessage): Promise<void> {
        if (!this.smtp) {
            this.logger.log({ mail: { to: mail.to, subject: mail.subject, text: mail.text } }, `Email not sent (MAIL_TRANSPORT=log): "${mail.subject}" to ${mail.to}`);
            return;
        }
        try {
            const info = await this.smtp.sendMail({
                from: this.config.mail.from,
                to: mail.to,
                subject: mail.subject,
                text: mail.text,
                html: mail.html,
                headers: { 'X-Correlation-Id': currentRequest()?.correlationId ?? '' },
            });
            this.logger.log({ to: mail.to, subject: mail.subject, messageId: info.messageId }, 'Email sent');
        } catch (err) {
            this.logger.error({ to: mail.to, subject: mail.subject, err: (err as Error).message }, 'Email delivery failed');
        }
    }
}
