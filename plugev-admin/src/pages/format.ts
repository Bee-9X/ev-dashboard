import { ROLE_LABELS, type RoleAssignment } from '../api/types';

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso));
}

export function roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
}

/** Where a role applies, in words. Networks and stations get names once those screens exist. */
export function roleScope(a: RoleAssignment): string {
    if (a.stationId) return `Station ${a.stationId.slice(0, 8)}`;
    if (a.networkId) return `Network ${a.networkId.slice(0, 8)}`;
    return a.role === 'SUPER_ADMIN' ? 'All networks' : 'Own account';
}

export function statusBadge(status: string): string {
    switch (status) {
        case 'active':
            return 'badge badge-success badge-dot';
        case 'invited':
            return 'badge badge-info badge-dot';
        case 'suspended':
        case 'inactive':
            return 'badge badge-warning badge-dot';
        case 'archived':
            return 'badge badge-neutral badge-dot';
        default:
            return 'badge badge-danger badge-dot';
    }
}

export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join('');
}

export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
