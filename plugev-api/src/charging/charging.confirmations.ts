import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * How long after the charger accepted a command its later messages may still confirm it (spec 5.3 step 22).
 * OCPP chargers wait up to their ConnectionTimeOut (often 1-3 minutes) for the cable before starting.
 */
export const CONFIRM_WITHIN_SEC: Record<string, number> = {
    RemoteStartTransaction: 300,
    RemoteStopTransaction: 300,
    Reset: 600,
    ChangeAvailability: 300,
};

/**
 * Marks accepted commands as confirmed when the charger's own messages show the action happened (spec 5.3 step 22,
 * 9.4: "Accepted" alone does not mean the physical operation completed). Never throws: charger traffic comes first.
 */
@Injectable()
export class CommandConfirmations {
    private readonly logger = new Logger('Commands');

    constructor(private readonly db: DataSource) {}

    /** StartTransaction after a remote start with the same idTag (on the requested connector, if one was given). */
    sessionStarted(evseId: string, connectorNumber: number, idTag: string | null, sessionId: string): Promise<void> {
        return this.confirm(
            `action = 'RemoteStartTransaction' AND payload->>'idTag' IS NOT DISTINCT FROM $3
             AND (connector_number IS NULL OR connector_number = $2)`,
            [evseId, connectorNumber, idTag],
            `The charger started a session on connector ${connectorNumber}`,
            sessionId,
        );
    }

    sessionStopped(evseId: string, transactionId: number, sessionId: string | null): Promise<void> {
        return this.confirm(
            `action = 'RemoteStopTransaction' AND (payload->>'transactionId')::bigint = $2`,
            [evseId, transactionId],
            'The charger reported the session stopped',
            sessionId,
        );
    }

    booted(evseId: string): Promise<void> {
        return this.confirm(`action = 'Reset'`, [evseId], 'The charger restarted (BootNotification)');
    }

    /** A connector (or the whole charger, 0) reported the status a ChangeAvailability asked for. */
    statusReported(evseId: string, connectorNumber: number, status: string | undefined): Promise<void> {
        if (!status) return Promise.resolve();
        const type = status === 'Unavailable' ? 'Inoperative' : status === 'Faulted' ? null : 'Operative';
        if (!type) return Promise.resolve();
        return this.confirm(
            `action = 'ChangeAvailability' AND payload->>'type' = $3 AND (connector_number = $2 OR connector_number = 0)`,
            [evseId, connectorNumber, type],
            connectorNumber === 0 ? `The charger reported itself ${status}` : `Connector ${connectorNumber} reported ${status}`,
        );
    }

    private async confirm(where: string, params: unknown[], confirmation: string, sessionId: string | null = null): Promise<void> {
        try {
            // 'sent' too: a charger may act (and report it) before its answer to the command has been stored
            await this.db.query(
                `UPDATE charger_commands SET confirmed_at = now(), confirmation = $${params.length + 1}, session_id = COALESCE($${params.length + 2}, session_id)
                 WHERE evse_id = $1 AND status IN ('sent', 'accepted') AND confirmed_at IS NULL
                   AND created_at > now() - make_interval(secs => CASE action
                       ${Object.entries(CONFIRM_WITHIN_SEC).map(([a, s]) => `WHEN '${a}' THEN ${s}`).join(' ')} ELSE 0 END)
                   AND ${where}`,
                [...params, confirmation, sessionId],
            );
        } catch (err) {
            this.logger.error(`Could not confirm a command for charger ${params[0]}: ${(err as Error).message}`);
        }
    }
}
