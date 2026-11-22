import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Mail } from 'lucide-react';
import { api, describeError } from '../../api/client';
import { AuthLayout } from '../../components/AuthLayout';
import { Alert, Button, leadIcon, TextField } from '../../components/ui';

export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.requestPasswordReset(email.trim());
            setSent(true);
        } catch (err) {
            setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AuthLayout title="Reset your password" footer={<Link to="/login">Back to sign in</Link>}>
            {sent ? (
                // The API answers the same whether or not the address exists, so we do too
                <Alert kind="success">
                    If <strong>{email.trim()}</strong> belongs to a PLUG EV account, a reset link is on its way. The link
                    works for 30 minutes.
                </Alert>
            ) : (
                <form onSubmit={submit} noValidate>
                    <p className="auth-lead">Enter the email you sign in with and we will send you a link to choose a new password.</p>
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
                    <Button type="submit" block loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
                        Send reset link
                    </Button>
                </form>
            )}
        </AuthLayout>
    );
}
