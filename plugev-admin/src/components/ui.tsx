import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { AlertCircle, CheckCircle2, Copy, Download, Eye, EyeOff, Info, KeyRound, TriangleAlert } from 'lucide-react';

/* ---------- Alert ---------- */

const ALERT_ICONS = { error: AlertCircle, success: CheckCircle2, info: Info, warning: TriangleAlert };

export function Alert({ kind, children }: { kind: keyof typeof ALERT_ICONS; children: ReactNode }) {
    const Icon = ALERT_ICONS[kind];
    return (
        <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden />
            <div>{children}</div>
        </div>
    );
}

/* ---------- Button ---------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'link';
    block?: boolean;
    loading?: boolean;
}

export function Button({ variant = 'primary', block, loading, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
    const classes = ['btn', variant !== 'primary' && `btn-${variant}`, block && 'btn-block', className].filter(Boolean).join(' ');
    return (
        <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
            {loading && <span className="spinner" aria-hidden />}
            {children}
        </button>
    );
}

/* ---------- Text fields ---------- */

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    label: string;
    value: string;
    onChange: (value: string) => void;
    icon?: ReactNode;
    hint?: ReactNode;
    error?: string | null;
}

export function TextField({ label, value, onChange, icon, hint, error, className, ...rest }: FieldProps) {
    const id = useId();
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <div className="input-wrap">
                {icon}
                <input
                    id={id}
                    className={['input', className].filter(Boolean).join(' ')}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    {...rest}
                />
            </div>
            {hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}
            {error && <span id={`${id}-error`} className="field-error">{error}</span>}
        </div>
    );
}

export function PasswordField(props: Omit<FieldProps, 'type'>) {
    const [visible, setVisible] = useState(false);
    const id = useId();
    const { label, value, onChange, icon, hint, error, ...rest } = props;
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <div className="input-wrap">
                {icon}
                <input
                    id={id}
                    type={visible ? 'text' : 'password'}
                    className="input has-action"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    {...rest}
                />
                <button
                    type="button"
                    className="input-action"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    aria-pressed={visible}
                >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
            {hint && <span id={`${id}-hint`} className="field-hint">{hint}</span>}
            {error && <span id={`${id}-error`} className="field-error">{error}</span>}
        </div>
    );
}

/** 6-digit code from an authenticator app. */
export function CodeField({ label = 'Verification code', value, onChange, autoFocus = true }: {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    autoFocus?: boolean;
}) {
    return (
        <TextField
            label={label}
            value={value}
            onChange={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
            className="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            autoFocus={autoFocus}
            required
        />
    );
}

export const leadIcon = (Icon: typeof KeyRound) => <Icon className="lead" size={18} aria-hidden />;

/* ---------- QR code (drawn in the browser: the secret never leaves this page) ---------- */

export function QrCode({ value, label }: { value: string; label: string }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        QRCode.toDataURL(value, { margin: 1, width: 368, errorCorrectionLevel: 'M' })
            .then((url) => active && setSrc(url))
            .catch(() => active && setSrc(null));
        return () => {
            active = false;
        };
    }, [value]);
    return <div className="qr">{src ? <img src={src} alt={label} /> : <span className="spinner" aria-label="Drawing QR code" />}</div>;
}

/* ---------- Copy helper ---------- */

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <Button
            variant="secondary"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch {
                    setCopied(false);
                }
            }}
        >
            <Copy size={16} aria-hidden />
            {copied ? 'Copied' : label}
        </Button>
    );
}

/* ---------- Recovery codes (shown once) ---------- */

export function RecoveryCodes({ codes, email }: { codes: string[]; email: string }) {
    const text = `PLUG EV recovery codes for ${email}\nEach code works once.\n\n${codes.join('\n')}\n`;
    const download = () => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plugev-recovery-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
    };
    return (
        <>
            <ul className="codes" aria-label="Recovery codes">
                {codes.map((c) => (
                    <li key={c}>{c}</li>
                ))}
            </ul>
            <div className="row" style={{ marginBottom: 18 }}>
                <CopyButton text={text} label="Copy codes" />
                <Button variant="secondary" onClick={download}>
                    <Download size={16} aria-hidden />
                    Download
                </Button>
            </div>
        </>
    );
}

/** Groups a base32 secret in fours so it is easier to type into an app. */
export function formatSecret(secret: string): string {
    return secret.replace(/(.{4})/g, '$1 ').trim();
}
