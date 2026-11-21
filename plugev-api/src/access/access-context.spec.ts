import { AccessContext, Grant } from './access-context';
import { P, ROLE_DEFINITIONS } from './permissions';

const grant = (role: keyof typeof ROLE_DEFINITIONS, networkId: string | null = null, stationId: string | null = null): Grant => ({
    assignmentId: `${role}-${networkId}-${stationId}`,
    role,
    scopeType: ROLE_DEFINITIONS[role].scopeType,
    networkId,
    stationId,
    permissions: new Set(ROLE_DEFINITIONS[role].permissions),
});

describe('AccessContext', () => {
    it('Super Admin: everything, everywhere', () => {
        const ctx = new AccessContext('u', 'e', [grant('SUPER_ADMIN')]);
        expect(ctx.isSuperAdmin).toBe(true);
        expect(ctx.scopeFor(P.NETWORK_READ)).toEqual({ all: true });
        expect(ctx.canOnNetwork(P.NETWORK_SUSPEND, 'any')).toBe(true);
    });

    it('Network Admin: own network and its stations only', () => {
        const ctx = new AccessContext('u', 'e', [grant('NETWORK_ADMIN', 'net-a')]);
        expect(ctx.canOnNetwork(P.NETWORK_READ, 'net-a')).toBe(true);
        expect(ctx.canOnNetwork(P.NETWORK_READ, 'net-b')).toBe(false);
        expect(ctx.canOnNetwork(P.NETWORK_SUSPEND, 'net-a')).toBe(false);
        expect(ctx.canOnStation(P.STATION_UPDATE, 'st-1', 'net-a')).toBe(true);
        expect(ctx.canOnStation(P.STATION_UPDATE, 'st-9', 'net-b')).toBe(false);
    });

    it('Station Admin: assigned stations, never the network itself', () => {
        const ctx = new AccessContext('u', 'e', [grant('STATION_ADMIN', 'net-a', 'st-1')]);
        expect(ctx.scopeFor(P.STATION_READ)).toEqual({ all: false, networkIds: [], stationIds: ['st-1'] });
        expect(ctx.canOnStation(P.STATION_READ, 'st-1', 'net-a')).toBe(true);
        expect(ctx.canOnStation(P.STATION_READ, 'st-2', 'net-a')).toBe(false);
        expect(ctx.canOnNetwork(P.STATION_READ, 'net-a')).toBe(false);
        expect(ctx.has(P.EVSE_REMOTE_START)).toBe(false); // only if explicitly delegated (spec 3.3)
    });

    it('multiple grants combine; permissions are per grant, not pooled across scopes', () => {
        const ctx = new AccessContext('u', 'e', [grant('NETWORK_ADMIN', 'net-a'), grant('STATION_ADMIN', 'net-b', 'st-b1')]);
        expect(ctx.canOnStation(P.STATION_READ, 'st-b1', 'net-b')).toBe(true);
        // NETWORK_ADMIN's user.read applies to net-a only, not to the station in net-b
        expect(ctx.scopeFor(P.USER_READ)).toEqual({ all: false, networkIds: ['net-a'], stationIds: [] });
    });

    it('no grants: nothing', () => {
        const ctx = new AccessContext('u', 'e', []);
        expect(ctx.permissions).toEqual([]);
        expect(ctx.scopeFor(P.NETWORK_READ)).toEqual({ all: false, networkIds: [], stationIds: [] });
    });
});
