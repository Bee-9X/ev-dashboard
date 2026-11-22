import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import type { EnrolledSignIn, MfaSetup, SignedIn } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AuthLayout } from '../../components/AuthLayout';
import {
    Alert, Button, CodeField, CopyButton, formatSecret, leadIcon, PasswordField, QrCode, RecoveryCodes, TextField,
} from '../../components/ui';

type Step =
    | { kind: 'credentials' }
    | { kind: 'mfa'; mfaToken: string; useRecovery: boolean }
    | { kind: 'enroll'; mfaToken: string; setup: MfaSetup | null }
    | { kind: 'recovery'; result: EnrolledSignIn };

/** Errors that mean the 5-minute sign-in step ran out: go back to email and password. */
const RESTART_CODES = new Set(['MFA_TOKEN_INVALID', 'TOKEN_INVALID']);

export function LoginPage() {
    const auth = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from ?? '/';

    const [step, setStep] = useState<Step>({ kind: 'credentials' });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (auth.status === 'signedIn' && step.kind !== 'recovery') return <Navigate to={from} replace />;

    const finish = async (result: SignedIn) => {
        await auth.signIn(result);
        navigate(from, { replace: true });
    };

    const restart = (message: string) => {
        setStep({ kind: 'credentials' });
        setPassword('');
        setCode('');
        setRecoveryCode('');
        setNotice(null);
        setError(message);
    };

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (err) {
            if (err instanceof ApiError && RESTART_CODES.has(err.code)) restart(err.message);
            else setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    const submitCredentials = (e: FormEvent) => {
        e.preventDefault();
        void run(async () => {
            const result = await api.login(email.trim(), password);
            setPassword('');
            if (result.status === 'authenticated') return finish(result);
            if (result.status === 'mfa_required') {
                setStep({ kind: 'mfa', mfaToken: result.mfaToken, useRecovery: false });
                return;
            }
            // The role requires MFA and none is set up yet: enrol now
            setNotice('Your role requires two-step verification. Set it up once to continue.');
            setStep({ kind: 'enroll', mfaToken: result.mfaToken, setup: null });
            const setup = await api.startEnrollment(result.mfaToken);
            setStep({ kind: 'enroll', mfaToken: result.mfaToken, setup });
        });
    };

    const submitMfa = (e: FormEvent) => {
        e.preventDefault();
        if (step.kind !== 'mfa') return;
        void run(async () => {
            const result = await api.verifyMfa(
                step.mfaToken,
                step.useRecovery ? { recoveryCode: recoveryCode.trim() } : { code },
            );
            await finish(result);
        });
    };

    const submitEnroll = (e: FormEvent) => {
        e.preventDefault();
        if (step.kind !== 'enroll') return;
        void run(async () => {
            const result = await api.confirmEnrollment(step.mfaToken, code);
            setNotice(null);
            setStep({ kind: 'recovery', result });
        });
    };

    if (step.kind === 'mfa') {
        return (
            <AuthLayout
                title="Two-step verification"
                footer={
                    <Button variant="link" onClick={() => restart('')}>
                        Sign in as someone else
                    </Button>
                }
            >
                <form onSubmit={submitMfa} noValidate>
                    {error && <Alert kind="error">{error}</Alert>}
                    {step.useRecovery ? (
                        <>
                            <p className="auth-lead">Enter one of the recovery codes you saved when you set up two-step verification. Each code works once.</p>
                            <TextField
                                label="Recovery code"
                                value={recoveryCode}
                                onChange={setRecoveryCode}
                                icon={leadIcon(KeyRound)}
                                placeholder="ABCDE-FGHJK"
                                autoComplete="off"
                                autoFocus
                                required
                            />
                        </>
                    ) : (
                        <>
                            <p className="auth-lead">Open your authenticator app and enter the 6-digit code for PLUG EV.</p>
                            <CodeField value={code} onChange={setCode} />
                        </>
                    )}
                    <Button
                        type="submit"
                        block
                        loading={busy}
                        disabled={step.useRecovery ? recoveryCode.trim().length < 10 : code.length !== 6}
                    >
                        Verify
                    </Button>
                    <p style={{ marginTop: 16, textAlign: 'center' }}>
                        <Button
                            variant="link"
                            onClick={() => {
                                setError(null);
                                setStep({ ...step, useRecovery: !step.useRecovery });
                            }}
                        >
                            {step.useRecovery ? 'Use a code from the app instead' : 'Lost your phone? Use a recovery code'}
                        </Button>
                    </p>
                </form>
            </AuthLayout>
        );
    }

    if (step.kind === 'enroll') {
        const { setup } = step;
        return (
            <AuthLayout title="Set up two-step verification">
                <div className="auth-steps" aria-hidden>
                    <span className="done" />
                    <span className="done" />
                    <span />
                </div>
                {notice && <Alert kind="info">{notice}</Alert>}
                {error && <Alert kind="error">{error}</Alert>}
                {!setup && busy ? (
                    <div className="page-status" style={{ minHeight: 200 }}>
                        <span className="spinner" aria-label="Preparing" />
                    </div>
                ) : !setup ? (
                    <Button block variant="secondary" onClick={() => restart('')}>
                        Back to sign in
                    </Button>
                ) : (
                    <form onSubmit={submitEnroll} noValidate>
                        <p className="auth-lead">
                            1. Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).
                        </p>
                        <QrCode value={setup.otpauthUrl} label="QR code for your authenticator app" />
                        <p className="field-hint">Can’t scan it? Enter this key in the app instead:</p>
                        <div className="secret">
                            <span data-testid="mfa-secret">{formatSecret(setup.secret)}</span>
                            <CopyButton text={setup.secret} />
                        </div>
                        <p className="auth-lead">2. Enter the 6-digit code the app shows.</p>
                        <CodeField value={code} onChange={setCode} autoFocus={false} />
                        <Button type="submit" block loading={busy} disabled={code.length !== 6}>
                            <ShieldCheck size={18} aria-hidden />
                            Turn on and continue
                        </Button>
                    </form>
                )}
            </AuthLayout>
        );
    }

    if (step.kind === 'recovery') {
        const { result } = step;
        return (
            <AuthLayout title="Save your recovery codes">
                <div className="auth-steps" aria-hidden>
                    <span className="done" />
                    <span className="done" />
                    <span className="done" />
                </div>
                <Alert kind="success">Two-step verification is on.</Alert>
                <p className="auth-lead">
                    If you lose your phone, each of these codes lets you sign in once. Store them somewhere safe, such as a
                    password manager. They are shown only now.
                </p>
                <RecoveryCodes codes={result.recoveryCodes} email={result.user.email} />
                {error && <Alert kind="error">{error}</Alert>}
                <label className="checkbox" style={{ marginBottom: 18 }}>
                    <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                    I have saved my recovery codes
                </label>
                <Button block disabled={!saved} loading={busy} onClick={() => void run(() => finish(result))}>
                    Continue to PLUG EV
                </Button>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title="Sign in" footer={<Link to="/forgot-password">Forgot your password?</Link>}>
            <form onSubmit={submitCredentials} noValidate>
                {error && <Alert kind="error">{error}</Alert>}
                <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    icon={leadIcon(Mail)}
                    placeholder="you@example.com"
                    autoComplete="username"
                    autoFocus
                    required
                />
                <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    icon={leadIcon(KeyRound)}
                    autoComplete="current-password"
                    required
                />
                <Button type="submit" block loading={busy} disabled={!email.trim() || !password}>
                    Sign in
                </Button>
            </form>
        </AuthLayout>
    );
}
