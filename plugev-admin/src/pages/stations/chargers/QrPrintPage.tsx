import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import logo from '../../../assets/logo-color.png';
import { api, describeError } from '../../../api/client';
import type { Evse, Station } from '../../../api/types';
import { Alert, Button, QrCode } from '../../../components/ui';
import { connectorLabel, evseTitle } from '../equipment';
import '../../../styles/print.css';

/** True when the QR links point to a development address that a phone cannot open. */
function isTestLink(url: string): boolean {
    try {
        const host = new URL(url).hostname;
        return host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.)/.test(host);
    } catch {
        return true;
    }
}

/** One sticker per connector, laid out for printing (outside the portal layout). */
export function QrPrintPage() {
    const { evseId = '' } = useParams();
    const [evse, setEvse] = useState<Evse | null>(null);
    const [station, setStation] = useState<Station | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.getEvse(evseId)
            .then(async (e) => {
                setEvse(e);
                setStation(await api.getStation(e.stationId).catch(() => null));
            })
            .catch((err) => setError(describeError(err)));
    }, [evseId]);

    const testLinks = evse?.connectors.some((c) => isTestLink(c.qrUrl)) ?? false;

    return (
        <div className="print-page">
            <div className="print-toolbar">
                <Link to={`/stations/chargers/${evseId}`} className="back-link">
                    <ArrowLeft size={16} aria-hidden /> Back to the charger
                </Link>
                <h1>QR stickers{evse ? `: ${evseTitle(evse)}` : ''}</h1>
                <p className="muted">
                    One sticker per connector. Stick each one next to its plug, so the driver scans the plug they are using.
                </p>
                {testLinks && (
                    <Alert kind="warning">
                        These codes link to a test address ({evse?.connectors[0] && new URL(evse.connectors[0].qrUrl).origin}). Do not
                        print them for real chargers until the PLUG EV link domain is set on the server (QR_LINK_BASE).
                    </Alert>
                )}
                {error && <Alert kind="error">{error}</Alert>}
                {evse && (
                    <Button onClick={() => window.print()}>
                        <Printer size={18} aria-hidden /> Print
                    </Button>
                )}
            </div>

            <div className="stickers">
                {evse?.connectors.map((c) => (
                    <div key={c.id} className="sticker">
                        <img src={logo} alt="PLUG EV" className="sticker-logo" />
                        <p className="sticker-call">Scan to charge</p>
                        <QrCode value={c.qrUrl} label={`QR code ${c.qrCode}`} className="sticker-qr" />
                        <p className="sticker-connector">
                            Connector {c.connectorNumber} · {connectorLabel(c)}
                        </p>
                        <p className="sticker-code">{c.qrCode}</p>
                        {station && <p className="sticker-station">{station.name}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
