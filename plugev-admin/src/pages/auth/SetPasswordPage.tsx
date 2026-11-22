import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { KeyRound } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import { PASSWORD_MAX, PASSWORD_MIN } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { AuthLayout } from '../../components/AuthLayout';
import { Alert, Button, leadIcon, PasswordField } from '../../components/ui';

/**
 * Opened from an email link: /reset-password?token=… (forgotten password) or
 * /accept-invite?token=… (first password of an invited administrator). Both use the same API call.
 */
export function SetPasswordPage({ mode }: { mode: 'reset' | 'invite' }) {
    const [params] = useSearchParams();
    const token = params.get('token') ?? '';
    const auth = useAuth();

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [touched, setTouched] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [linkInvalid, setLinkInvalid] = useState(!token);
    const [busy, setBusy] = useState(false);

    const invite = mode === 'invite';
    const tooShort = password.length < PASSWORD_MIN;
    const mismatch = confirm.length > 0 && confirm !== password;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (tooShort || password !== confirm) return;
        setBusy(true);
        setError(null);
        try {
            await api.confirmPasswordReset(token, password);
            // A reset revokes every session of the account, including one open in this browser
            if (auth.status === 'signedIn') await auth.signOut();
            setDone(true);
        } catch (err) {
            if (err instanceof ApiError && err.code === 'TOKEN_INVALID') setLinkInvalid(true);
            else setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    const title = invite ? 'Activate your account' : 'Choose a new password';

    if (linkInvalid) {
        return (
            <AuthLayout title={title} footer={<Link to="/login">Back to sign in</Link>}>
                <Alert kind="error">
                    This link is invalid, has expired or was already used.{' '}
                    {invite ? 'Ask your administrator to send a new invitation.' : 'Request a new reset link.'}
                </Alert>
                {!invite && (
                    <Link className="btn btn-block" to="/forgot-password">
                        Request a new link
                    </Link>
                )}
            </AuthLayout>
        );
    }

    if (done) {
        return (
            <AuthLayout title={title}>
                <Alert kind="success">
                    {invite ? 'Your account is active.' : 'Your password has been changed and other sessions were signed out.'}
                </Alert>
                <Link className="btn btn-block" to="/login">
                    Sign in
                </Link>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout title={title} footer={<Link to="/login">Back to sign in</Link>}>
            <form onSubmit={submit} noValidate>
                <p className="auth-lead">
                    {invite
                        ? 'Welcome to PLUG EV. Choose a password to activate your administrator account.'
                        : 'Choose a new password for your PLUG EV account.'}
                </p>
                {error && <Alert kind="error">{error}</Alert>}
                <PasswordField
                    label="New password"
                    value={password}
                    onChange={setPassword}
                    icon={leadIcon(KeyRound)}
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX}
                    hint={`At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`}
                    error={touched && tooShort ? `Use at least ${PASSWORD_MIN} characters.` : null}
                    autoFocus
                    required
                />
                <PasswordField
                    label="Confirm new password"
                    value={confirm}
                    onChange={setConfirm}
                    icon={leadIcon(KeyRound)}
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX}
                    error={mismatch || (touched && confirm !== password) ? 'The passwords do not match.' : null}
                    required
                />
                <Button type="submit" block loading={busy}>
                    {invite ? 'Activate account' : 'Change password'}
                </Button>
            </form>
        </AuthLayout>
    );
}
