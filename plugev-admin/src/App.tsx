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
            <Route
                element={
                    <SessionGate>
                        <AppLayout />
                    </SessionGate>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
