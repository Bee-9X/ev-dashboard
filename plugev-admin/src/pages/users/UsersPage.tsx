import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, ShieldCheck, ShieldOff, UserPlus, Users } from 'lucide-react';
import { api, describeError } from '../../api/client';
import type { Page, UserSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Pagination } from '../../components/dialogs';
import { Alert, Button, leadIcon, SelectField, TextField } from '../../components/ui';
import { capitalize, formatDateTime, initials, roleLabel, statusBadge } from '../format';
import { InviteDialog } from './InviteDialog';
import { describeScope, useScopes } from './scopes';

const PAGE_SIZE = 20;
const STATUSES = ['active', 'invited', 'suspended', 'deactivated'];

export function UsersPage() {
    const { me, can } = useAuth();
    const scopes = useScopes();
    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Number(params.get('page')) || 1);
    const status = params.get('status') ?? '';
    const search = params.get('search') ?? '';

    const [searchInput, setSearchInput] = useState(search);
    const [data, setData] = useState<Page<UserSummary> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [invited, setInvited] = useState<UserSummary | null>(null);

    const isSuperAdmin = me?.roles.some((r) => r.role === 'SUPER_ADMIN') ?? false;
    const canInvite = can('user.create') && can('role.assign');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await api.listUsers({ page, pageSize: PAGE_SIZE, status, search }));
        } catch (err) {
            setError(describeError(err));
        } finally {
            setLoading(false);
        }
    }, [page, status, search]);

    useEffect(() => {
        void load();
    }, [load]);

    // Search as you type, after a short pause
    useEffect(() => {
        if (searchInput.trim() === search) return;
        const t = setTimeout(() => update({ search: searchInput.trim(), page: '' }), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    function update(changes: Record<string, string>) {
        const next = new URLSearchParams(params);
        for (const [k, v] of Object.entries(changes)) {
            if (v) next.set(k, v);
            else next.delete(k);
        }
        setParams(next, { replace: true });
    }

    return (
        <>
            <div className="page-title">
                <h1>User Management</h1>
                <p>Administrators who can sign in to the PLUG EV portal</p>
            </div>

            <div className="tabs" role="tablist">
                <button type="button" role="tab" className="tab" aria-selected={false} disabled>
                    EV Users <span className="soon">Soon</span>
                </button>
                <button type="button" role="tab" className="tab" aria-selected>
                    Admin Role
                </button>
            </div>

            {invited && (
                <Alert kind="success">
                    Invitation sent to <strong>{invited.email}</strong>. Until an email service is set up, the link is written to
                    the API log.
                </Alert>
            )}

            <section className="widget" aria-labelledby="admins-title">
                <h2 className="widget-title" id="admins-title">
                    <Users size={20} aria-hidden /> Admin Role Information
                </h2>

                <div className="toolbar">
                    <div className="grow">
                        <TextField
                            label="Search"
                            type="search"
                            value={searchInput}
                            onChange={setSearchInput}
                            icon={leadIcon(Search)}
                            placeholder="Name or email"
                        />
                    </div>
                    <div className="narrow">
                        <SelectField
                            label="Status"
                            value={status}
                            onChange={(v) => update({ status: v, page: '' })}
                            placeholder="All statuses"
                            options={STATUSES.map((s) => ({ value: s, label: capitalize(s) }))}
                        />
                    </div>
                    {canInvite && (
                        <Button onClick={() => setInviting(true)}>
                            <UserPlus size={18} aria-hidden /> Invite admin
                        </Button>
                    )}
                </div>

                {error && (
                    <Alert kind="error">
                        {error}{' '}
                        <Button variant="link" onClick={() => void load()}>
                            Try again
                        </Button>
                    </Alert>
                )}

                <div className="table-wrap">
                    <table className="table" aria-busy={loading}>
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Admin role</th>
                                <th>Phone</th>
                                <th>Status</th>
                                <th>2-step</th>
                                <th>Last sign-in</th>
                                <th className="num">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.items.map((u) => (
                                <tr key={u.id}>
                                    <td>
                                        <div className="cell-user">
                                            <span className="avatar" aria-hidden>{initials(u.fullName)}</span>
                                            <div>
                                                <strong>
                                                    {u.fullName}
                                                    {u.id === me?.id && <span className="muted"> (you)</span>}
                                                </strong>
                                                <span>{u.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        {u.roles.length === 0 ? (
                                            <span className="muted">No role</span>
                                        ) : (
                                            <div className="role-list">
                                                {u.roles.map((r) => (
                                                    <div key={r.assignmentId}>
                                                        {roleLabel(r.role)} <small>· {describeScope(r, scopes)}</small>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="nowrap">{u.phone ?? <span className="muted">—</span>}</td>
                                    <td>
                                        <span className={statusBadge(u.status)}>{capitalize(u.status)}</span>
                                    </td>
                                    <td>
                                        {u.mfaEnabled ? (
                                            <ShieldCheck size={18} color="var(--success)" aria-label="On" />
                                        ) : (
                                            <ShieldOff size={18} color="var(--text-muted)" aria-label="Off" />
                                        )}
                                    </td>
                                    <td className="nowrap">{formatDateTime(u.lastLoginAt)}</td>
                                    <td className="num">
                                        <Link className="btn btn-secondary btn-sm" to={`/users/${u.id}`} aria-label={`View ${u.fullName}`}>
                                            View
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {loading && !data && (
                        <div className="empty">
                            <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
                        </div>
                    )}
                    {data && data.items.length === 0 && (
                        <div className="empty">{search || status ? 'No administrators match.' : 'No administrators yet.'}</div>
                    )}
                </div>

                {data && (
                    <Pagination
                        page={data.page}
                        pageSize={data.pageSize}
                        total={data.total}
                        loading={loading}
                        onPage={(p) => update({ page: String(p) })}
                    />
                )}
            </section>

            {inviting && (
                <InviteDialog
                    isSuperAdmin={isSuperAdmin}
                    scopes={scopes}
                    onClose={() => setInviting(false)}
                    onInvited={(u) => {
                        setInviting(false);
                        setInvited(u);
                        void load();
                    }}
                />
            )}
        </>
    );
}
