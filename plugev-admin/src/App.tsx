import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { AppLayout } from './components/AppLayout';
import { Button } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SetPasswordPage } from './pages/auth/SetPasswordPage';
import { NetworkDetailPage } from './pages/stations/NetworkDetailPage';
import { StationDetailPage } from './pages/stations/StationDetailPage';
import { StationsPage } from './pages/stations/StationsPage';
import { ChargerDetailPage } from './pages/stations/chargers/ChargerDetailPage';
import { QrPrintPage } from './pages/stations/chargers/QrPrintPage';
import { SessionDetailPage } from './pages/stations/sessions/SessionDetailPage';
import { UserDetailPage } from './pages/users/UserDetailPage';
import { UsersPage } from './pages/users/UsersPage';

function SessionGate({ children }: { children: ReactNode }) {
    const { status, retry } = useAuth();
    const location = useLocation();

    if (status === 'loading') {
        return (
            <div className="page-status">
                <span className="spinner" aria-label="Loading" />
            </div>
        );
    }
    if (status === 'unreachable') {
        return (
            <div className="page-status">
                <h2>Cannot reach the PLUG EV server</h2>
                <p className="muted">Check your connection. Your session is kept.</p>
                <Button onClick={retry}>Try again</Button>
            </div>
        );
    }
    if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return <>{children}</>;
}

/** Hides a screen from users without the permission (the API enforces it too). */
function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
    const { can } = useAuth();
    if (!can(permission)) {
        return (
            <div className="widget" style={{ maxWidth: 560 }}>
                <h1>No access</h1>
                <p className="muted">Your role does not include this screen. Ask an administrator if you need it.</p>
                <Link to="/">Go to the dashboard</Link>
            </div>
        );
    }
    return <>{children}</>;
}

function NotFoundPage() {
    return (
        <div className="widget" style={{ maxWidth: 520 }}>
            <h1>Page not found</h1>
            <p className="muted">This page does not exist or has moved.</p>
            <Link to="/">Go to the dashboard</Link>
        </div>
    );
}

export function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            {/* Links in the emails sent by plugev-api */}
            <Route path="/reset-password" element={<SetPasswordPage mode="reset" />} />
            <Route path="/accept-invite" element={<SetPasswordPage mode="invite" />} />
            {/* QR stickers: a printable sheet without the portal layout */}
            <Route
                path="/print/chargers/:evseId"
                element={
                    <SessionGate>
                        <RequirePermission permission="evse.read">
                            <QrPrintPage />
                        </RequirePermission>
                    </SessionGate>
                }
            />
            <Route
                element={
                    <SessionGate>
                        <AppLayout />
                    </SessionGate>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="users" element={<RequirePermission permission="user.read"><UsersPage /></RequirePermission>} />
                <Route path="users/:userId" element={<RequirePermission permission="user.read"><UserDetailPage /></RequirePermission>} />
                <Route path="stations" element={<RequirePermission permission="station.read"><StationsPage /></RequirePermission>} />
                <Route
                    path="stations/networks/:networkId"
                    element={<RequirePermission permission="network.read"><NetworkDetailPage /></RequirePermission>}
                />
                <Route
                    path="stations/chargers/:evseId"
                    element={<RequirePermission permission="evse.read"><ChargerDetailPage /></RequirePermission>}
                />
                <Route
                    path="stations/sessions/:sessionId"
                    element={<RequirePermission permission="session.read"><SessionDetailPage /></RequirePermission>}
                />
                <Route path="stations/:stationId"element={<RequirePermission permission="station.read"><StationDetailPage /></RequirePermission>} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
