import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/config';

/**
 * Outgoing email. No provider is chosen yet (spec 17), so this implementation only logs. Outside
 * production it logs the link itself so invitations and resets can be completed during development.
 * Replace with a real provider (SES, SendGrid, SMTP, ...) behind the same methods.
 */
@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

    async sendInvite(to: string, fullName: string, link: string): Promise<void> {
        this.deliver(to, 'You have been invited to PLUG EV', `Hello ${fullName}, set your password: ${link}`, link);
    }

    async sendPasswordReset(to: string, link: string): Promise<void> {
        this.deliver(to, 'Reset your PLUG EV password', `Reset your password: ${link}`, link);
    }

    private deliver(to: string, subject: string, _body: string, link: string): void {
        if (this.config.nodeEnv === 'production') {
            this.logger.warn({ to, subject }, 'Email delivery is not configured; message not sent');
        } else {
            this.logger.log({ to, subject, link }, 'Email (development: not sent, link logged)');
        }
    }
}
