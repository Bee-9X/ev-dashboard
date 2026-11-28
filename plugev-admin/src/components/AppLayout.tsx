import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import {
    Activity, ChevronRight, CircleDollarSign, EvCharger, House, Landmark, LogOut, Menu, PlugZap, UserRound,
    UserRoundCog, X,
} from 'lucide-react';
import logo from '../assets/logo-grey.png';
import { useAuth } from '../auth/AuthProvider';
import { initials } from '../pages/format';
import '../styles/layout.css';

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

interface NavEntry {
    label: string;
    icon: Icon;
    to?: string; // missing = not built yet ("Soon")
    permission?: string;
    children?: { label: string; to?: string; permission?: string }[];
}

// Same menu as the Phase 0 portal; screens that are not built yet are shown as "Soon".
const MANAGEMENT: NavEntry[] = [
    { label: 'Accounts', icon: Landmark },
    {
        label: 'User',
        icon: UserRound,
        children: [
            { label: 'User Management', to: '/users', permission: 'user.read' },
            { label: 'My Profile', to: '/profile' },
        ],
    },
    { label: 'Stations', icon: EvCharger, to: '/stations', permission: 'station.read' },
];

const ACTIVITY: NavEntry[] = [
    { label: 'TopUp Accounts', icon: CircleDollarSign },
    { label: 'Remote Start', icon: PlugZap },
    { label: 'My Recent Activity', icon: Activity },
];

export function crumbsFor(path: string): string[] {
    if (path === '/') return ['Dashboard'];
    if (path === '/profile') return ['User', 'My Profile'];
    if (path === '/users') return ['User', 'User Management'];
    if (path.startsWith('/users/')) return ['User', 'User Management', 'User Profile'];
    if (path === '/stations') return ['Stations'];
    if (path.startsWith('/stations/chargers/')) return ['Stations', 'Charger Terminals', 'Terminal Information'];
    if (path.startsWith('/stations/sessions/')) return ['Stations', 'Charging Sessions', 'Session Information'];
    if (path.startsWith('/stations/networks/')) return ['Stations', 'Charging Networks', 'Network Information'];
    if (path.startsWith('/stations/')) return ['Stations', 'Chargers Stations', 'Station Information'];
    return [];
}

function Soon() {
    return <span className="soon">Soon</span>;
}

function NavGroup({ entry, onNavigate }: { entry: NavEntry; onNavigate: () => void }) {
    const location = useLocation();
    const { can } = useAuth();
    const children = entry.children?.filter((c) => !c.permission || can(c.permission));
    const childActive = children?.some((c) => c.to && location.pathname.startsWith(c.to)) ?? false;
    const [open, setOpen] = useState(childActive);
    const Icon = entry.icon;

    if (entry.permission && !can(entry.permission)) return null;

    if (children) {
        return (
            <li className="nav-item">
                <button
                    type="button"
                    className={`nav-link${childActive ? ' active' : ''}`}
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                >
                    <span className="nav-icon"><Icon size={20} aria-hidden /></span>
                    <span className="nav-label">{entry.label}</span>
                    <ChevronRight size={16} className={`nav-chevron${open ? ' open' : ''}`} aria-hidden />
                </button>
                {open && (
                    <ul className="nav-children">
                        {children.map((c) => (
                            <li key={c.label}>
                                {c.to ? (
                                    <NavLink to={c.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onNavigate}>
                                        {c.label}
                                    </NavLink>
                                ) : (
                                    <span className="nav-link disabled" aria-disabled>
                                        <span className="nav-label">{c.label}</span>
                                        <Soon />
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </li>
        );
    }

    if (!entry.to) {
        return (
            <li className="nav-item">
                <span className="nav-link disabled" aria-disabled>
                    <span className="nav-icon"><Icon size={20} aria-hidden /></span>
                    <span className="nav-label">{entry.label}</span>
                    <Soon />
                </span>
            </li>
        );
    }

    return (
        <li className="nav-item">
            <NavLink to={entry.to} end={entry.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={onNavigate}>
                <span className="nav-icon"><Icon size={20} aria-hidden /></span>
                <span className="nav-label">{entry.label}</span>
            </NavLink>
        </li>
    );
}

function UserMenu() {
    const { me, signOut } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent | KeyboardEvent) => {
            if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [open]);

    if (!me) return null;
    return (
        <div className="user-menu" ref={ref}>
            <button type="button" className="user-toggle" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <span className="avatar" aria-hidden>{initials(me.fullName)}</span>
                <span className="user-name">{me.fullName}</span>
            </button>
            {open && (
                <div className="menu" role="menu">
                    <div className="menu-header">
                        <strong>{me.fullName}</strong>
                        <span>{me.email}</span>
                    </div>
                    <Link to="/profile" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
                        <UserRoundCog size={18} aria-hidden /> My Profile
                    </Link>
                    <button type="button" className="menu-item" role="menuitem" onClick={() => void signOut()}>
                        <LogOut size={18} aria-hidden /> Sign out
                    </button>
                </div>
            )}
        </div>
    );
}

export function AppLayout() {
    const [navOpen, setNavOpen] = useState(false);
    const location = useLocation();
    const crumbs = crumbsFor(location.pathname);

    // close the mobile menu after navigating
    useEffect(() => setNavOpen(false), [location.pathname]);

    return (
        <div className={`shell${navOpen ? ' nav-open' : ''}`}>
            <nav className="sidebar" aria-label="Main">
                <Link to="/" className="sidebar-logo" aria-label="PLUG EV home">
                    <img src={logo} alt="" />
                </Link>
                <ul className="nav">
                    <NavGroup entry={{ label: 'Dashboard', icon: House, to: '/' }} onNavigate={() => setNavOpen(false)} />
                </ul>
                <h2 className="nav-title">Management Area</h2>
                <ul className="nav">
                    {MANAGEMENT.map((e) => (
                        <NavGroup key={e.label} entry={e} onNavigate={() => setNavOpen(false)} />
                    ))}
                </ul>
                <h2 className="nav-title">Activity Area</h2>
                <ul className="nav">
                    {ACTIVITY.map((e) => (
                        <NavGroup key={e.label} entry={e} onNavigate={() => setNavOpen(false)} />
                    ))}
                </ul>
            </nav>
            <div className="backdrop" onClick={() => setNavOpen(false)} aria-hidden />

            <div className="main">
                <header className="header">
                    <button
                        type="button"
                        className="icon-btn burger"
                        aria-label={navOpen ? 'Close menu' : 'Open menu'}
                        onClick={() => setNavOpen((o) => !o)}
                    >
                        {navOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="breadcrumb" aria-label="Breadcrumb">
                        {['PLUG EV', ...crumbs].map((c) => (
                            <span key={c}>{c}</span>
                        ))}
                    </div>
                    <div className="header-spacer" />
                    <UserMenu />
                </header>
                <main className="content">
                    <Outlet />
                </main>
                <footer className="footer">© {new Date().getFullYear()} PLUG EV · Plug “N” Drive</footer>
            </div>
        </div>
    );
}
