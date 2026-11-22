import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BadgeCheck, ShieldAlert, Trash2, UserRound } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import type { RoleAssignment, UserStatus, UserSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Alert, Button, Modal, TextAreaField } from '../../components/ui';
import { capitalize, formatDate, formatDateTime, initials, roleLabel, statusBadge } from '../format';
import { describeScope, emptyRole, RoleFields, roleTarget, useScopes, type RoleDraft } from './scopes';

type Action =
    | { kind: 'status'; status: Exclude<UserStatus, 'invited'> }
    | { kind: 'mfa' }
    | { kind: 'addRole' }
    | { kind: 'removeRole'; assignment: RoleAssignment };

const STATUS_ACTIONS: Record<UserStatus, { status: Exclude<UserStatus, 'invited'>; label: string; danger?: boolean }[]> = {
    active: [
        { status: 'suspended', label: 'Suspend' },
        { status: 'deactivated', label: 'Deactivate', danger: true },
    ],
    suspended: [
        { status: 'active', label: 'Reactivate' },
        { status: 'deactivated', label: 'Deactivate', danger: true },
    ],
    deactivated: [{ status: 'active', label: 'Reactivate' }],
    invited: [{ status: 'deactivated', label: 'Cancel invitation', danger: true }],
};

const STATUS_EXPLAIN: Record<Exclude<UserStatus, 'invited'>, string> = {
    suspended: 'They are signed out everywhere and cannot sign in until reactivated.',
    deactivated: 'They are signed out everywhere and the account is closed. It can be reactivated later.',
    active: 'They can sign in again with their existing password.',
};

export function UserDetailPage() {
    const { userId = '' } = useParams();
    const { me, can } = useAuth();
    const scopes = useScopes();
    const [user, setUser] = useState<UserSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [action, setAction] = useState<Action | null>(null);

    const isSuperAdmin = me?.roles.some((r) => r.role === 'SUPER_ADMIN') ?? false;
    const isSelf = me?.id === userId;
    const canManage = can('user.update_status') && !isSelf;
    const canAssign = can('role.assign') && !isSelf;

    const load = useCallback(async () => {
        setError(null);
        try {
            setUser(await api.getUser(userId));
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) setNotFound(true);
            else setError(describeError(err));
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const done = (updated: UserSummary, message: string) => {
        setUser(updated);
        setAction(null);
        setNotice(message);
    };

    if (notFound) {
        return (
            <div className="widget" style={{ maxWidth: 560 }}>
                <h1>User not found</h1>
                <p className="muted">This user does not exist or is outside your networks.</p>
                <Link to="/users">Back to User Management</Link>
            </div>
        );
    }

    return (
        <>
            <Link to="/users" className="back-link">
                <ArrowLeft size={16} aria-hidden /> User Management
            </Link>
            {error && <Alert kind="error">{error}</Alert>}
            {!user ? (
                !error && <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
            ) : (
                <>
                    <div className="page-title row" style={{ gap: 16 }}>
                        <span className="avatar" style={{ width: 56, height: 56, fontSize: '1.2rem' }} aria-hidden>
                            {initials(user.fullName)}
                        </span>
                        <div>
                            <h1>{user.fullName}</h1>
                            <p>
                                {user.email} · <span className={statusBadge(user.status)}>{capitalize(user.status)}</span>
                            </p>
                        </div>
                    </div>

                    {notice && <Alert kind="success">{notice}</Alert>}
                    {isSelf && (
                        <Alert kind="info">
                            This is your account. Another administrator must change your roles or status; your own security
                            settings are in <Link to="/profile">My Profile</Link>.
                        </Alert>
                    )}

                    <div className="grid">
                        <section className="widget" aria-labelledby="user-details">
                            <h2 className="widget-title" id="user-details">
                                <UserRound size={20} aria-hidden /> Details
                            </h2>
                            <dl className="details">
                                <dt>Phone</dt>
                                <dd>{user.phone ?? '—'}</dd>
                                <dt>Two-step verification</dt>
                                <dd>
                                    {user.mfaEnabled ? (
                                        <span className="badge badge-success badge-dot">On</span>
                                    ) : (
                                        <span className="badge badge-warning badge-dot">Off</span>
                                    )}
                                </dd>
                                <dt>Member since</dt>
                                <dd>{formatDate(user.createdAt)}</dd>
                                <dt>Last sign-in</dt>
                                <dd>{formatDateTime(user.lastLoginAt)}</dd>
                            </dl>
                        </section>

                        <section className="widget" aria-labelledby="user-roles">
                            <h2 className="widget-title" id="user-roles">
                                <BadgeCheck size={20} aria-hidden /> Roles
                            </h2>
                            {user.roles.length === 0 ? (
                                <p className="muted">No roles. Without a role they can sign in but see nothing.</p>
                            ) : (
                                <ul className="nav" style={{ marginBottom: 14 }}>
                                    {user.roles.map((r) => (
                                        <li key={r.assignmentId} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
                                            <span>
                                                <strong>{roleLabel(r.role)}</strong>{' '}
                                                <span className="muted">· {describeScope(r, scopes)} · since {formatDate(r.effectiveFrom)}</span>
                                            </span>
                                            {canAssign && (
                                                <Button
                                                    variant="secondary"
                                                    className="btn-sm"
                                                    aria-label={`Remove ${roleLabel(r.role)}`}
                                                    onClick={() => setAction({ kind: 'removeRole', assignment: r })}
                                                >
                                                    <Trash2 size={15} aria-hidden /> Remove
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {canAssign && user.status !== 'deactivated' && (
                                <Button variant="secondary" onClick={() => setAction({ kind: 'addRole' })}>
                                    Add role
                                </Button>
                            )}
                        </section>

                        {canManage && (
                            <section className="widget danger-zone" aria-labelledby="user-access">
                                <h2 className="widget-title" id="user-access">
                                    <ShieldAlert size={20} aria-hidden /> Account access
                                </h2>
                                <p className="muted">Every change needs a reason and is kept in the audit log.</p>
                                <div className="row">
                                    {STATUS_ACTIONS[user.status].map((a) => (
                                        <Button
                                            key={a.status}
                                            variant={a.danger ? 'danger' : 'secondary'}
                                            onClick={() => setAction({ kind: 'status', status: a.status })}
                                        >
                                            {a.label}
                                        </Button>
                                    ))}
                                    {user.mfaEnabled && (
                                        <Button variant="secondary" onClick={() => setAction({ kind: 'mfa' })}>
                                            Reset two-step verification
                                        </Button>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    {action?.kind === 'status' && (
                        <ReasonDialog
                            title={`${STATUS_ACTIONS[user.status].find((a) => a.status === action.status)?.label ?? 'Change status'}: ${user.fullName}`}
                            explain={STATUS_EXPLAIN[action.status]}
                            confirm={STATUS_ACTIONS[user.status].find((a) => a.status === action.status)?.label ?? 'Confirm'}
                            danger={action.status !== 'active'}
                            onClose={() => setAction(null)}
                            onConfirm={async (reason) =>
                                done(await api.setUserStatus(user.id, action.status, reason), `Status changed to ${action.status}.`)
                            }
                        />
                    )}
                    {action?.kind === 'mfa' && (
                        <ReasonDialog
                            title={`Reset two-step verification: ${user.fullName}`}
                            explain="Use this when they lost their phone and their recovery codes. They are signed out and set it up again at their next sign-in."
                            confirm="Reset"
                            danger
                            onClose={() => setAction(null)}
                            onConfirm={async (reason) =>
                                done(await api.resetUserMfa(user.id, reason), 'Two-step verification was reset. They set it up again at their next sign-in.')
                            }
                        />
                    )}
                    {action?.kind === 'removeRole' && (
                        <ConfirmDialog
                            title={`Remove ${roleLabel(action.assignment.role)}`}
                            explain={`${user.fullName} loses this role (${describeScope(action.assignment, scopes)}) immediately.`}
                            confirm="Remove role"
                            onClose={() => setAction(null)}
                            onConfirm={async () =>
                                done(await api.revokeRole(user.id, action.assignment.assignmentId), `${roleLabel(action.assignment.role)} removed.`)
                            }
                        />
                    )}
                    {action?.kind === 'addRole' && (
                        <AddRoleDialog
                            isSuperAdmin={isSuperAdmin}
                            scopes={scopes}
                            onClose={() => setAction(null)}
                            onAdd={async (target) => done(await api.assignRole(user.id, target), `${roleLabel(target.role)} added.`)}
                        />
                    )}
                </>
            )}
        </>
    );
}

function useSubmit(fn: () => Promise<void>) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(describeError(err));
            setBusy(false);
        }
    };
    return { busy, error, run };
}

function ReasonDialog({ title, explain, confirm, danger, onClose, onConfirm }: {
    title: string;
    explain: string;
    confirm: string;
    danger?: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
}) {
    const [reason, setReason] = useState('');
    const { busy, error, run } = useSubmit(() => onConfirm(reason.trim()));
    return (
        <Modal title={title} onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (reason.trim()) void run();
                }}
                noValidate
            >
                <p className="muted">{explain}</p>
                {error && <Alert kind="error">{error}</Alert>}
                <TextAreaField label="Reason" value={reason} onChange={setReason} maxLength={500} hint="Kept in the audit log." autoFocus required />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!reason.trim()}>
                        {confirm}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function ConfirmDialog({ title, explain, confirm, onClose, onConfirm }: {
    title: string;
    explain: string;
    confirm: string;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    const { busy, error, run } = useSubmit(onConfirm);
    return (
        <Modal title={title} onClose={onClose} busy={busy}>
            <p className="muted">{explain}</p>
            {error && <Alert kind="error">{error}</Alert>}
            <div className="modal-actions">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button variant="danger" loading={busy} onClick={() => void run()}>
                    {confirm}
                </Button>
            </div>
        </Modal>
    );
}

function AddRoleDialog({ isSuperAdmin, scopes, onClose, onAdd }: {
    isSuperAdmin: boolean;
    scopes: ReturnType<typeof useScopes>;
    onClose: () => void;
    onAdd: (target: NonNullable<ReturnType<typeof roleTarget>>) => Promise<void>;
}) {
    const [draft, setDraft] = useState<RoleDraft>(isSuperAdmin ? emptyRole : { ...emptyRole, role: 'STATION_ADMIN' });
    const target = roleTarget(draft);
    const { busy, error, run } = useSubmit(() => (target ? onAdd(target) : Promise.resolve()));
    return (
        <Modal title="Add a role" onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (target) void run();
                }}
                noValidate
            >
                {error && <Alert kind="error">{error}</Alert>}
                <RoleFields value={draft} onChange={setDraft} isSuperAdmin={isSuperAdmin} scopes={scopes} />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy} disabled={!target}>
                        Add role
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
