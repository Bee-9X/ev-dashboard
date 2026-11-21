import { ROLES } from './permissions';

/** One active role assignment of the signed-in user, with the permissions its role grants. */
export interface Grant {
    assignmentId: string;
    role: string;
    scopeType: 'platform' | 'network' | 'station' | 'self';
    networkId: string | null; // network scope, or the parent network of a station grant
    stationId: string | null;
    permissions: ReadonlySet<string>;
}

export type Scope = { all: true } | { all: false; networkIds: string[]; stationIds: string[] };

/**
 * What the authenticated user may do, and where. Built on the server from the user's active role
 * assignments; never from ids the client sends (spec 2.2).
 */
export class AccessContext {
    constructor(
        readonly userId: string,
        readonly email: string,
        readonly grants: readonly Grant[],
    ) {}

    get isSuperAdmin(): boolean {
        return this.grants.some(g => g.role === ROLES.SUPER_ADMIN);
    }

    get roles(): string[] {
        return [...new Set(this.grants.map(g => g.role))];
    }

    get permissions(): string[] {
        return [...new Set(this.grants.flatMap(g => [...g.permissions]))].sort();
    }

    /** Has the permission somewhere (used by the route guard; resources are checked separately). */
    has(permission: string): boolean {
        return this.grants.some(g => g.permissions.has(permission));
    }

    /**
     * Where the permission applies. Platform grants cover everything; network grants cover the network
     * and all its stations; station grants cover only those stations.
     */
    scopeFor(permission: string): Scope {
        const grants = this.grants.filter(g => g.permissions.has(permission));
        if (grants.some(g => g.scopeType === 'platform')) return { all: true };
        const networkIds = new Set<string>();
        const stationIds = new Set<string>();
        for (const g of grants) {
            if (g.scopeType === 'network' && g.networkId) networkIds.add(g.networkId);
            if (g.scopeType === 'station' && g.stationId) stationIds.add(g.stationId);
        }
        return { all: false, networkIds: [...networkIds], stationIds: [...stationIds] };
    }

    /** Network-level resources (the network record itself): platform or network grants only. */
    canOnNetwork(permission: string, networkId: string): boolean {
        const s = this.scopeFor(permission);
        return s.all || s.networkIds.includes(networkId);
    }

    /** Station-level resources: platform, the station's network, or a direct station grant. */
    canOnStation(permission: string, stationId: string, stationNetworkId: string): boolean {
        const s = this.scopeFor(permission);
        return s.all || s.networkIds.includes(stationNetworkId) || s.stationIds.includes(stationId);
    }
}
