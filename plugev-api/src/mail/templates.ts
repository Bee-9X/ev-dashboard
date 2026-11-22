/** Email content. Plain text plus a simple HTML version; every inserted value is escaped. */

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    html: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function layout(title: string, paragraphs: string[], action: { label: string; url: string }, footer: string): string {
    return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2933">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<tr><td>
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map(p => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(p)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(action.url)}" style="background:#1870dc;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:600">${esc(action.label)}</a></p>
<p style="font-size:13px;color:#616e7c;line-height:1.5;margin:0 0 8px">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${esc(action.url)}</span></p>
<p style="font-size:13px;color:#616e7c;line-height:1.5;margin:16px 0 0">${esc(footer)}</p>
</td></tr></table>
</body></html>`;
}

export function inviteMail(to: string, fullName: string, link: string, validHours: number): MailMessage {
    const intro = `Hello ${fullName},`;
    const body = 'You have been invited to the PLUG EV management portal. Set your password to activate your account.';
    const expiry = `This link works once and expires in ${validHours} hours.`;
    const footer = 'If you did not expect this invitation, you can ignore this email.';
    return {
        to,
        subject: 'You have been invited to PLUG EV',
        text: [intro, '', body, '', link, '', expiry, footer].join('\n'),
        html: layout('Welcome to PLUG EV', [intro, body, expiry], { label: 'Set your password', url: link }, footer),
    };
}

export function passwordResetMail(to: string, link: string, validMinutes: number): MailMessage {
    const body = 'Someone asked to reset the password of your PLUG EV account.';
    const expiry = `This link works once and expires in ${validMinutes} minutes.`;
    const footer = 'If it was not you, ignore this email: your password stays the same.';
    return {
        to,
        subject: 'Reset your PLUG EV password',
        text: [body, '', link, '', expiry, footer].join('\n'),
        html: layout('Reset your password', [body, expiry], { label: 'Choose a new password', url: link }, footer),
    };
}
