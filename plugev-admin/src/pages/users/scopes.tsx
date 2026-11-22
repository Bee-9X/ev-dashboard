import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { AdminRole, Network, RoleAssignment, RoleTarget, Station } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { SelectField } from '../../components/ui';
import { roleLabel } from '../format';

export interface Scopes {
    networks: Network[];
    stations: Station[];
    loaded: boolean;
    networkName(id: string | null): string | undefined;
    stationName(id: string | null): string | undefined;
}

/** Networks and stations the signed-in admin can see, for names and role pickers. */
export function useScopes(): Scopes {
    const { can } = useAuth();
    const [networks, setNetworks] = useState<Network[]>([]);
    const [stations, setStations] = useState<Station[]>([]);
    const [loaded, setLoaded] = useState(false);
    const canNetworks = can('network.read');
    const canStations = can('station.read');

    useEffect(() => {
        let active = true;
        Promise.all([
            canNetworks ? api.listNetworks().then((p) => p.items) : Promise.resolve([]),
            canStations ? api.listStations().then((p) => p.items) : Promise.resolve([]),
        ])
            .then(([n, s]) => {
                if (!active) return;
                setNetworks(n);
                setStations(s);
            })
            .catch(() => undefined) // names are a nicety; ids are shown instead
            .finally(() => active && setLoaded(true));
        return () => {
            active = false;
        };
    }, [canNetworks, canStations]);

    return useMemo(
        () => ({
            networks,
            stations,
            loaded,
            networkName: (id) => networks.find((n) => n.id === id)?.name,
            stationName: (id) => stations.find((s) => s.id === id)?.name,
        }),
        [networks, stations, loaded],
    );
}

/** Where a role applies, with names when known. */
export function describeScope(a: Pick<RoleAssignment, 'role' | 'networkId' | 'stationId'>, scopes: Scopes): string {
    if (a.stationId) {
        const station = scopes.stations.find((s) => s.id === a.stationId);
        const network = station && scopes.networkName(station.networkId);
        return station ? `${station.name}${network ? ` · ${network}` : ''}` : `Station ${a.stationId.slice(0, 8)}`;
    }
    if (a.networkId) return scopes.networkName(a.networkId) ?? `Network ${a.networkId.slice(0, 8)}`;
    return a.role === 'SUPER_ADMIN' ? 'All networks' : '—';
}

/** Roles this admin may give: a Super Admin any; a Network Admin only Station Admin (spec 3.3). */
export function assignableRoles(isSuperAdmin: boolean): AdminRole[] {
    return isSuperAdmin ? ['SUPER_ADMIN', 'NETWORK_ADMIN', 'STATION_ADMIN'] : ['STATION_ADMIN'];
}

export interface RoleDraft {
    role: AdminRole | '';
    networkId: string;
    stationId: string;
}

export const emptyRole: RoleDraft = { role: '', networkId: '', stationId: '' };

export function roleTarget(d: RoleDraft): RoleTarget | null {
    if (d.role === 'SUPER_ADMIN') return { role: 'SUPER_ADMIN' };
    if (d.role === 'NETWORK_ADMIN') return d.networkId ? { role: 'NETWORK_ADMIN', networkId: d.networkId } : null;
    if (d.role === 'STATION_ADMIN') return d.stationId ? { role: 'STATION_ADMIN', stationId: d.stationId } : null;
    return null;
}

const ROLE_HINTS: Record<AdminRole, string> = {
    SUPER_ADMIN: 'Full access to every network. Requires two-step verification.',
    NETWORK_ADMIN: 'Manages one network: stations, tariffs, Station Admins and reports. Requires two-step verification.',
    STATION_ADMIN: 'Monitors one station.',
};

/** Role, then the network or station it applies to. */
export function RoleFields({ value, onChange, isSuperAdmin, scopes }: {
    value: RoleDraft;
    onChange: (v: RoleDraft) => void;
    isSuperAdmin: boolean;
    scopes: Scopes;
}) {
    const roles = assignableRoles(isSuperAdmin);
    const activeNetworks = scopes.networks.filter((n) => n.status !== 'archived');
    // Station Admin: choose the network first when there are several, then the station
    const stationNetwork = value.networkId || (activeNetworks.length === 1 ? activeNetworks[0]!.id : '');
    const stations = scopes.stations.filter((s) => !stationNetwork || s.networkId === stationNetwork);

    return (
        <>
            <SelectField
                label="Role"
                value={value.role}
                onChange={(role) => onChange({ role: role as AdminRole | '', networkId: '', stationId: '' })}
                placeholder="Choose a role"
                options={roles.map((r) => ({ value: r, label: roleLabel(r) }))}
                hint={value.role ? ROLE_HINTS[value.role] : undefined}
                required
            />
            {(value.role === 'NETWORK_ADMIN' || (value.role === 'STATION_ADMIN' && activeNetworks.length > 1)) && (
                <SelectField
                    label="Network"
                    value={value.networkId}
                    onChange={(networkId) => onChange({ ...value, networkId, stationId: '' })}
                    placeholder={scopes.loaded ? 'Choose a network' : 'Loading…'}
                    options={activeNetworks.map((n) => ({ value: n.id, label: n.name }))}
                    hint={scopes.loaded && activeNetworks.length === 0 ? 'No networks yet. Create one first.' : undefined}
                    required
                />
            )}
            {value.role === 'STATION_ADMIN' && (
                <SelectField
                    label="Station"
                    value={value.stationId}
                    onChange={(stationId) => onChange({ ...value, stationId })}
                    placeholder={scopes.loaded ? 'Choose a station' : 'Loading…'}
                    options={stations.map((s) => ({ value: s.id, label: s.name }))}
                    disabled={activeNetworks.length > 1 && !value.networkId}
                    hint={scopes.loaded && stations.length === 0 ? 'No stations available.' : undefined}
                    required
                />
            )}
        </>
    );
}
