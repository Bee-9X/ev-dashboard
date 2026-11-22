import type { ReactNode } from 'react';
import logo from '../assets/logo-color.png';
import '../styles/auth.css';

/** Frame of every sign-in page: the PLUG EV logo banner over the dark panel, as in the old portal. */
export function AuthLayout({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
    return (
        <main className="auth-page">
            <div className="auth-card">
                <div className="auth-logo">
                    <img src={logo} alt="PLUG EV – Plug “N” Drive" />
                </div>
                <section className="auth-panel" aria-labelledby="auth-title">
                    <div className="auth-tabs">
                        <h1 id="auth-title" className="auth-tab">
                            {title}
                        </h1>
                    </div>
                    {children}
                    {footer && <div className="auth-footer">{footer}</div>}
                </section>
                <p className="auth-copyright">© {new Date().getFullYear()} PLUG EV · Management portal</p>
            </div>
        </main>
    );
}
