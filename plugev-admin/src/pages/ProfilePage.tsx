import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { api, describeError } from '../api/client';
import type { MfaSetup, MfaStatus } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Alert, Button, CodeField, CopyButton, formatSecret, QrCode, RecoveryCodes } from '../components/ui';
import { formatDate, formatDateTime, roleLabel, roleScope, statusBadge } from './format';

type MfaAction =
    | { kind: 'idle' }
    | { kind: 'setup'; setup: MfaSetup }
    | { kind: 'regenerate' }
    | { kind: 'disable' }
    | { kind: 'codes'; codes: string[]; message: string };

export function ProfilePage() {
    const { me, reloadMe } = useAuth();
    if (!me) return null;

    return (
        <>
            <div className="page-title">
                <h1>My Profile</h1>
                <p>Your account details and sign-in security</p>
            </div>
            <div className="grid">
                <section className="widget" aria-labelledby="details-title">
                    <h2 className="widget-title" id="details-title">
                        <UserRound size={20} aria-hidden /> Details
                    </h2>
                    <dl className="details">
                        <dt>Name</dt>
                        <dd>{me.fullName}</dd>
                        <dt>Email</dt>
                        <dd>{me.email}</dd>
                        <dt>Phone</dt>
                        <dd>{me.phone ?? '—'}</dd>
                        <dt>Status</dt>
                        <dd><span className={statusBadge(me.status)}>{me.status.charAt(0).toUpperCase() + me.status.slice(1)}</span></dd>
                        <dt>Member since</dt>
                        <dd>{formatDate(me.createdAt)}</dd>
                        <dt>Last sign-in</dt>
                        <dd>{formatDateTime(me.lastLoginAt)}</dd>
                    </dl>
                    <h3 style={{ marginTop: 22 }}>Roles</h3>
                    {me.roles.length === 0 ? (
                        <p className="muted">No roles assigned.</p>
                    ) : (
                        <dl className="details">
                            {me.roles.map((r) => (
                                <div key={r.assignmentId} style={{ display: 'contents' }}>
                                    <dt>{roleLabel(r.role)}</dt>
                                    <dd>{roleScope(r)} · since {formatDate(r.effectiveFrom)}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                <div className="stack">
                    <MfaWidget onChanged={reloadMe} />
                    <PasswordWidget email={me.email} />
                </div>
            </div>
        </>
    );
}

function MfaWidget({ onChanged }: { onChanged: () => Promise<void> }) {
    const { me } = useAuth();
    const [status, setStatus] = useState<MfaStatus | null>(null);
    const [action, setAction] = useState<MfaAction>({ kind: 'idle' });
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setStatus(await api.mfaStatus());
        } catch (err) {
            setError(describeError(err));
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    const cancel = () => {
        setAction({ kind: 'idle' });
        setCode('');
        setError(null);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        void run(async () => {
            if (action.kind === 'setup') {
                const { recoveryCodes } = await api.mfaConfirm(code);
                setAction({ kind: 'codes', codes: recoveryCodes, message: 'Two-step verification is on.' });
            } else if (action.kind === 'regenerate') {
                const { recoveryCodes } = await api.mfaRegenerateCodes(code);
                setAction({ kind: 'codes', codes: recoveryCodes, message: 'New recovery codes created. The old ones no longer work.' });
            } else if (action.kind === 'disable') {
                await api.mfaDisable(code);
                setAction({ kind: 'idle' });
            }
            setCode('');
            await Promise.all([load(), onChanged()]);
        });
    };

    return (
        <section className="widget" aria-labelledby="mfa-title">
            <h2 className="widget-title" id="mfa-title">
                <ShieldCheck size={20} aria-hidden /> Two-step verification
            </h2>
            {error && <Alert kind="error">{error}</Alert>}
            {!status ? (
                !error && <span className="spinner" aria-label="Loading" />
            ) : (
                <>
                    <dl className="details" style={{ marginBottom: 16 }}>
                        <dt>Status</dt>
                        <dd>
                            {status.enabled ? (
                                <span className="badge badge-success badge-dot">On</span>
                            ) : (
                                <span className="badge badge-warning badge-dot">Off</span>
                            )}
                            {status.required && <span className="badge" style={{ marginLeft: 8 }}>Required for your role</span>}
                        </dd>
                        {status.enabled && (
                            <>
                                <dt>Turned on</dt>
                                <dd>{formatDateTime(status.enabledAt)}</dd>
                                <dt>Recovery codes left</dt>
                                <dd>{status.recoveryCodesRemaining} of 10</dd>
                            </>
                        )}
                    </dl>

                    {status.enabled && status.recoveryCodesRemaining <= 2 && action.kind === 'idle' && (
                        <Alert kind="warning">You are running out of recovery codes. Create a new set.</Alert>
                    )}

                    {action.kind === 'codes' && (
                        <>
                            <Alert kind="success">{action.message}</Alert>
                            <p className="muted">Save these codes now; they are shown only once.</p>
                            <RecoveryCodes codes={action.codes} email={me?.email ?? ''} />
                            <Button variant="secondary" onClick={cancel}>Done</Button>
                        </>
                    )}

                    {action.kind === 'idle' && (
                        <div className="row">
                            {status.enabled ? (
                                <>
                                    <Button variant="secondary" onClick={() => setAction({ kind: 'regenerate' })}>
                                        New recovery codes
                                    </Button>
                                    {!status.required && (
                                        <Button variant="secondary" onClick={() => setAction({ kind: 'disable' })}>
                                            Turn off
                                        </Button>
                                    )}
                                </>
                            ) : (
                                <Button
                                    loading={busy}
                                    onClick={() => void run(async () => setAction({ kind: 'setup', setup: await api.mfaSetup() }))}
                                >
                                    Set up two-step verification
                                </Button>
                            )}
                        </div>
                    )}

                    {(action.kind === 'setup' || action.kind === 'regenerate' || action.kind === 'disable') && (
                        <form onSubmit={submit} noValidate>
                            {action.kind === 'setup' && (
                                <>
                                    <p className="muted">Scan the code with your authenticator app, then enter the 6-digit code it shows.</p>
                                    <QrCode value={action.setup.otpauthUrl} label="QR code for your authenticator app" />
                                    <div className="secret">
                                        <span>{formatSecret(action.setup.secret)}</span>
                                        <CopyButton text={action.setup.secret} />
                                    </div>
                                </>
                            )}
                            {action.kind === 'regenerate' && (
                                <p className="muted">Enter a code from your authenticator app to create 10 new recovery codes.</p>
                            )}
                            {action.kind === 'disable' && (
                                <Alert kind="warning">Without two-step verification, your password alone protects this account.</Alert>
                            )}
                            <CodeField value={code} onChange={setCode} />
                            <div className="row">
                                <Button type="submit" variant={action.kind === 'disable' ? 'danger' : 'primary'} loading={busy} disabled={code.length !== 6}>
                                    {action.kind === 'setup' ? 'Turn on' : action.kind === 'regenerate' ? 'Create codes' : 'Turn off'}
                                </Button>
                                <Button variant="secondary" onClick={cancel} disabled={busy}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    )}
                </>
            )}
        </section>
    );
}

function PasswordWidget({ email }: { email: string }) {
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const send = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.requestPasswordReset(email);
            setSent(true);
        } catch (err) {
            setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="widget" aria-labelledby="password-title">
            <h2 className="widget-title" id="password-title">
                <KeyRound size={20} aria-hidden /> Password
            </h2>
            {error && <Alert kind="error">{error}</Alert>}
            {sent ? (
                <Alert kind="success">
                    A link to change your password was sent to {email}. Changing it signs you out everywhere.
                </Alert>
            ) : (
                <>
                    <p className="muted">We send a link to your email to confirm it is you. Changing the password signs you out everywhere.</p>
                    <Button variant="secondary" loading={busy} onClick={() => void send()}>
                        Email me a change link
                    </Button>
                </>
            )}
        </section>
    );
}
