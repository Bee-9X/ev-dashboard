import { Logger } from '@nestjs/common';
import { AddressInfo, createServer, Server } from 'node:net';
import { loadConfig } from '../config/config';
import { MailService } from './mail.service';
import { inviteMail, passwordResetMail } from './templates';

const base = {
    DATABASE_URL: 'postgres://u:p@localhost/db',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const LINK = 'http://portal.test/accept-invite?token=0b6c1f4e-8f0e-4f5b-9a77-1f2a3b4c5d6e.abcDEF_123-xyz';

/** Minimal SMTP server: enough of RFC 5321 for one plain-text session, recording what it receives. */
function fakeSmtp(): Promise<{ port: number; received: { from: string; to: string[]; data: string }[]; close: () => Promise<void> }> {
    const received: { from: string; to: string[]; data: string }[] = [];
    const server: Server = createServer(sock => {
        sock.setEncoding('utf8');
        let buf = '';
        let inData = false;
        let cur = { from: '', to: [] as string[], data: '' };
        const reply = (line: string) => sock.write(`${line}\r\n`);
        reply('220 fake.test ESMTP');
        sock.on('data', chunk => {
            buf += chunk;
            let i: number;
            while ((i = buf.indexOf('\r\n')) >= 0) {
                const line = buf.slice(0, i);
                buf = buf.slice(i + 2);
                if (inData) {
                    if (line === '.') {
                        inData = false;
                        received.push(cur);
                        cur = { from: '', to: [], data: '' };
                        reply('250 OK queued');
                    } else {
                        cur.data += (line.startsWith('..') ? line.slice(1) : line) + '\n';
                    }
                    continue;
                }
                const cmd = line.slice(0, 4).toUpperCase();
                if (cmd === 'EHLO' || cmd === 'HELO') reply('250 fake.test');
                else if (cmd === 'MAIL') { cur.from = line; reply('250 OK'); }
                else if (cmd === 'RCPT') { cur.to.push(line); reply('250 OK'); }
                else if (cmd === 'DATA') { inData = true; reply('354 End data with <CR><LF>.<CR><LF>'); }
                else if (cmd === 'QUIT') { reply('221 Bye'); sock.end(); }
                else if (cmd === 'RSET' || cmd === 'NOOP') reply('250 OK');
                else reply('502 Command not implemented');
            }
        });
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
        port: (server.address() as AddressInfo).port,
        received,
        close: () => new Promise<void>(r => server.close(() => r())),
    })));
}

/** Undo quoted-printable encoding (soft line breaks and =XX) so the body can be searched. */
const decodeQp = (s: string) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

describe('mail templates', () => {
    it('contain the link and expiry, and escape user supplied names in HTML', () => {
        const m = inviteMail('a@b.lk', '<script>alert(1)</script> & Co', LINK, 72);
        expect(m.text).toContain(LINK);
        expect(m.text).toContain('72 hours');
        expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
        expect(m.html).not.toContain('<script>');
        expect(m.html).toContain(LINK);
        expect(passwordResetMail('a@b.lk', LINK, 30).text).toContain('30 minutes');
    });
});

describe('MailService', () => {
    afterEach(() => jest.restoreAllMocks());

    it('log transport (default) writes the full message, link included, and sends nothing', async () => {
        const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const mail = new MailService(loadConfig(base));
        await mail.onModuleInit();
        await mail.sendInvite('new.admin@plugev.lk', 'New Admin', LINK);
        const [payload, message] = log.mock.calls.at(-1)!;
        expect(message).toBe('Email not sent (MAIL_TRANSPORT=log): "You have been invited to PLUG EV" to new.admin@plugev.lk');
        expect((payload as { mail: { text: string } }).mail.text).toContain(LINK);
    });

    it('log transport warns at startup in production', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
        await new MailService(loadConfig({ ...base, NODE_ENV: 'production' })).onModuleInit();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('MAIL_TRANSPORT=log'));
    });

    it('smtp transport delivers text and HTML to the SMTP server', async () => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const smtp = await fakeSmtp();
        try {
            const mail = new MailService(loadConfig({
                ...base, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port),
                SMTP_REQUIRE_TLS: 'false', MAIL_FROM: 'PLUG EV <noreply@plugev.lk>',
            }));
            await mail.sendPasswordReset('user@plugev.lk', LINK);

            expect(smtp.received).toHaveLength(1);
            const [msg] = smtp.received;
            expect(msg.from).toMatch(/^MAIL FROM:<noreply@plugev\.lk>/);
            expect(msg.to).toEqual([expect.stringMatching(/^RCPT TO:<user@plugev\.lk>/)]);
            expect(msg.data).toMatch(/^Subject: Reset your PLUG EV password$/m);
            expect(msg.data).toMatch(/^Content-Type: text\/html/m);
            expect(decodeQp(msg.data)).toContain(LINK);
        } finally {
            await smtp.close();
        }
    });

    it('a delivery failure is logged, not thrown', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const mail = new MailService(loadConfig({
            ...base, MAIL_TRANSPORT: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_REQUIRE_TLS: 'false',
        }));
        await expect(mail.sendInvite('a@plugev.lk', 'A', LINK)).resolves.toBeUndefined();
        expect(error).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@plugev.lk' }), 'Email delivery failed');
    });
});
