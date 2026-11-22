import { Link } from 'react-router';
import { ShieldCheck, ShieldOff, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/ui';
import { formatDateTime, roleLabel, roleScope } from './format';

export function DashboardPage() {
    const { me } = useAuth();
    if (!me) return null;
    const firstName = me.fullName.split(/\s+/)[0];

    return (
        <>
            <div className="page-title">
                <h1>Welcome back, {firstName}</h1>
                <p>PLUG EV management portal</p>
            </div>

            <Alert kind="info">
                The portal is moving to the new platform screen by screen. Sign-in, your profile and User Management are live; the other menu
                items marked “Soon” follow next.
            </Alert>

            <div className="grid">
                <section className="widget" aria-labelledby="access-title">
                    <h2 className="widget-title" id="access-title">
                        <UserRound size={20} aria-hidden /> Your access
                    </h2>
                    {me.roles.length === 0 ? (
                        <p className="muted">No roles assigned yet. Ask an administrator for access.</p>
                    ) : (
                        <dl className="details">
                            {me.roles.map((r) => (
                                <div key={r.assignmentId} style={{ display: 'contents' }}>
                                    <dt>{roleLabel(r.role)}</dt>
                                    <dd>{roleScope(r)}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
                        {me.permissions.length} permissions
                    </p>
                </section>

                <section className="widget" aria-labelledby="security-title">
                    <h2 className="widget-title" id="security-title">
                        {me.mfaEnabled ? <ShieldCheck size={20} aria-hidden /> : <ShieldOff size={20} aria-hidden />} Account
                        security
                    </h2>
                    <dl className="details">
                        <dt>Two-step verification</dt>
                        <dd>
                            {me.mfaEnabled ? (
                                <span className="badge badge-success badge-dot">On</span>
                            ) : (
                                <span className="badge badge-warning badge-dot">Off</span>
                            )}
                        </dd>
                        <dt>Last sign-in</dt>
                        <dd>{formatDateTime(me.lastLoginAt)}</dd>
                    </dl>
                    <p style={{ marginTop: 14, marginBottom: 0 }}>
                        <Link to="/profile">Manage security settings</Link>
                    </p>
                </section>
            </div>
        </>
    );
}
