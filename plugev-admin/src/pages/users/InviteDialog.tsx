import { useState, type FormEvent } from 'react';
import { Mail, Phone, UserRound } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import type { UserSummary } from '../../api/types';
import { Alert, Button, leadIcon, Modal, TextField } from '../../components/ui';
import { emptyRole, RoleFields, roleTarget, type RoleDraft, type Scopes } from './scopes';

const PHONE = /^\+?[0-9 ()-]{6,20}$/;

/** Invites an administrator: the API emails them a link to set a password (logged until email is set up). */
export function InviteDialog({ onClose, onInvited, isSuperAdmin, scopes }: {
    onClose: () => void;
    onInvited: (user: UserSummary) => void;
    isSuperAdmin: boolean;
    scopes: Scopes;
}) {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [role, setRole] = useState<RoleDraft>(isSuperAdmin ? emptyRole : { ...emptyRole, role: 'STATION_ADMIN' });
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);

    const target = roleTarget(role);
    const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
    const phoneOk = !phone.trim() || PHONE.test(phone.trim());
    const valid = fullName.trim() && emailOk && phoneOk && target;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!valid || !target) return;
        setBusy(true);
        setError(null);
        setFieldErrors({});
        try {
            const user = await api.inviteUser({
                ...target,
                fullName: fullName.trim(),
                email: email.trim(),
                ...(phone.trim() ? { phone: phone.trim() } : {}),
            });
            onInvited(user);
        } catch (err) {
            if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setFieldErrors({ email: err.message });
            else setError(describeError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title="Invite an administrator" onClose={onClose} busy={busy}>
            <form onSubmit={submit} noValidate>
                <p className="muted">They receive an email with a link to set their password. The link is valid for 72 hours.</p>
                {error && <Alert kind="error">{error}</Alert>}
                <TextField
                    label="Full name"
                    value={fullName}
                    onChange={setFullName}
                    icon={leadIcon(UserRound)}
                    maxLength={200}
                    error={touched && !fullName.trim() ? 'Enter their name.' : null}
                    autoFocus
                    required
                />
                <TextField
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    icon={leadIcon(Mail)}
                    maxLength={254}
                    error={fieldErrors.email ?? (touched && !emailOk ? 'Enter a valid email address.' : null)}
                    required
                />
                <TextField
                    label="Phone (optional)"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    icon={leadIcon(Phone)}
                    placeholder="+94 77 123 4567"
                    error={touched && !phoneOk ? 'Enter a valid phone number.' : null}
                />
                <RoleFields value={role} onChange={setRole} isSuperAdmin={isSuperAdmin} scopes={scopes} />
                {touched && !target && <p className="field-error" style={{ marginTop: -10 }}>Choose a role and where it applies.</p>}
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        Send invitation
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
