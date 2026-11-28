import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import express from 'express';
import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DataSource } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/config';
import { ConnectionRegistry, LiveState, OcppMessageLog } from './charging.state';
import { JsonAdapter } from './json.adapter';
import { SoapAdapter } from './soap.adapter';

const SWEEP_MS = 15000;
const PURGE_MS = 6 * 3600 * 1000;

/**
 * The charging module's own listener: chargers connect here (OCPP SOAP and OCPP-J on one port, the one ngrok
 * exposes), never to the admin API's port. Runs inside the API process (ADR-004, revised 2026-11-27).
 */
@Injectable()
export class ChargingServer implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger('Charging');
    private server: Server | null = null;
    private timers: NodeJS.Timeout[] = [];

    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        private readonly db: DataSource,
        private readonly soap: SoapAdapter,
        private readonly json: JsonAdapter,
        private readonly registry: ConnectionRegistry,
        private readonly live: LiveState,
        private readonly messages: OcppMessageLog,
    ) {}

    /** The port chargers connect to, once listening (tests use a random one). */
    get port(): number | null {
        const address = this.server?.address() as AddressInfo | null | undefined;
        return address?.port ?? null;
    }

    async onApplicationBootstrap(): Promise<void> {
        if (!this.config.ocpp.enabled) {
            this.logger.log('Charger connections are switched off (OCPP_ENABLED=false)');
            return;
        }
        // nothing is connected yet; online states from before the restart cannot be trusted
        await this.markAllOffline('server restart');

        const app = express();
        app.disable('x-powered-by');
        app.get('/', (_req, res) => {
            res.status(200).send('PLUG EV charger endpoint (OCPP 1.5/1.6 SOAP and OCPP 1.6J)');
        });
        app.get('/health', (_req, res) => {
            res.json({ ok: true });
        });
        app.use(this.soap.router());
        // anything else: log it and answer 200 so a misconfigured charger does not give up silently
        app.post(/.*/, express.text({ type: () => true, limit: '1mb' }), (req, res) => {
            this.logger.warn(`Unmatched POST ${req.url} from ${req.socket.remoteAddress}: ${String(req.body ?? '').slice(0, 200)}`);
            res.status(200).send('OK');
        });

        this.json.start();
        const server = createServer(app);
        server.on('upgrade', (req, socket, head) => {
            void this.json.handleUpgrade(req, socket, head);
        });
        server.on('clientError', (_err, socket) => socket.destroy());

        const listening = await new Promise<boolean>(resolve => {
            server.once('error', (err: NodeJS.ErrnoException) => {
                this.logger.error(err.code === 'EADDRINUSE'
                    ? `Port ${this.config.ocpp.port} is already in use, so chargers cannot connect. Is plugev-server (the old gateway) still running? Stop it and restart the API.`
                    : `Charger port could not open: ${err.message}`);
                resolve(false);
            });
            server.listen(this.config.ocpp.port, () => resolve(true));
        });
        if (!listening) {
            this.json.stop();
            return;
        }
        this.server = server;
        this.logger.log(`Chargers connect on port ${this.port}: SOAP http://<host>/ocpp/<Charger ID>, OCPP-J ws://<host>/ocpp/<Charger ID>`);

        this.timers.push(setInterval(() => void this.sweep().catch(err => this.logger.error(`Offline sweep failed: ${err.message}`)), SWEEP_MS));
        const purge = () => this.messages.purgeOld()
            .then(n => n && this.logger.log(`Removed ${n} OCPP messages older than ${this.config.ocpp.messageRetentionDays} days`))
            .catch(err => this.logger.error(`OCPP message clean-up failed: ${err.message}`));
        void purge();
        this.timers.push(setInterval(() => void purge(), PURGE_MS));
        for (const t of this.timers) t.unref();
    }

    async onApplicationShutdown(): Promise<void> {
        for (const t of this.timers) clearInterval(t);
        this.timers = [];
        this.json.stop();
        if (this.server) {
            const server = this.server;
            this.server = null;
            server.closeAllConnections?.();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    }

    /**
     * Chargers heard from too long ago go offline (OCPP-J chargers with an open WebSocket stay online), and commands
     * that never got an answer (e.g. the API restarted while waiting) time out.
     */
    async sweep(): Promise<void> {
        await this.db.query(
            `UPDATE charger_commands SET status = 'timed_out', answered_at = now(),
                 error = COALESCE(error, 'No answer from the charger in time')
             WHERE status IN ('queued', 'sent') AND expires_at < now()`,
        );
        const after = this.config.chargerOfflineAfterSec;
        const stale: { id: string; protocol_identity: string }[] = await this.db.query(
            `SELECT e.id, e.protocol_identity FROM evse_live_states l JOIN evses e ON e.id = l.evse_id
             WHERE l.connection_state = 'online' AND l.last_seen_at < now() - make_interval(secs => $1)`,
            [after],
        );
        for (const c of stale) {
            if (this.registry.hasOpenConnection(c.protocol_identity)) continue;
            this.logger.log(`[${c.protocol_identity}] Offline: no message for more than ${after}s`);
            await this.live.disconnected({ id: c.id, protocolIdentity: c.protocol_identity }, `no message for more than ${after}s`);
        }
    }

    private async markAllOffline(reason: string): Promise<void> {
        const online: { id: string; protocol_identity: string }[] = await this.db.query(
            `SELECT e.id, e.protocol_identity FROM evse_live_states l JOIN evses e ON e.id = l.evse_id WHERE l.connection_state = 'online'`,
        );
        for (const c of online) await this.live.disconnected({ id: c.id, protocolIdentity: c.protocol_identity }, reason);
    }
}
