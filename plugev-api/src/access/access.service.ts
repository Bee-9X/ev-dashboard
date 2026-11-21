import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccessContext, Grant } from './access-context';

interface GrantRow {
    assignment_id: string;
    role_code: string;
    scope_type: Grant['scopeType'];
    network_id: string | null;
    station_id: string | null;
    station_network_id: string | null;
    permissions: string[] | null;
}

@Injectable()
export class AccessService {
    constructor(private readonly db: DataSource) {}

    /**
     * Loads the user's access context, or null if the account is not active.
     * Read on every request so suspensions and role removals take effect immediately.
     * Grants on suspended/archived networks (or their stations) are ignored.
     */
    async load(userId: string): Promise<AccessContext | null> {
        const [user] = await this.db.query(
            `SELECT id, email FROM users WHERE id = $1 AND status = 'active'`, [userId],
        ) as { id: string; email: string }[];
        if (!user) return null;

        const rows = await this.db.query(`
            SELECT a.id AS assignment_id, a.role_code, r.scope_type, a.network_id, a.station_id,
                   s.network_id AS station_network_id,
                   array_remove(array_agg(rp.permission_code), NULL) AS permissions
              FROM user_role_assignments a
              JOIN roles r ON r.code = a.role_code
              LEFT JOIN stations s ON s.id = a.station_id
              LEFT JOIN networks n ON n.id = coalesce(a.network_id, s.network_id)
              LEFT JOIN role_permissions rp ON rp.role_code = a.role_code
             WHERE a.user_id = $1
               AND a.effective_from <= now()
               AND (a.effective_to IS NULL OR a.effective_to > now())
               AND (n.id IS NULL OR n.status = 'active')
               AND (s.id IS NULL OR s.status = 'active')
             GROUP BY a.id, r.scope_type, s.network_id`, [userId]) as GrantRow[];

        const grants: Grant[] = rows.map(r => ({
            assignmentId: r.assignment_id,
            role: r.role_code,
            scopeType: r.scope_type,
            networkId: r.network_id ?? r.station_network_id,
            stationId: r.station_id,
            permissions: new Set(r.permissions ?? []),
        }));
        return new AccessContext(user.id, user.email, grants);
    }
}
