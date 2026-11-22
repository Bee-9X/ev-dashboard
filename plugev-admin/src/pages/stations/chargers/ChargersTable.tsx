import { Link } from 'react-router';
import type { Evse } from '../../../api/types';
import { capitalize, statusBadge } from '../../format';
import { CONNECTOR_LABELS, evseTitle, timeAgo } from '../equipment';

/** Online / Offline / Never connected, with when it was last heard from. */
export function Connection({ evse }: { evse: Evse }) {
    if (!evse.live) return <span className="badge badge-neutral">Never connected</span>;
    return (
        <span title={`Last message ${timeAgo(evse.live.lastSeenAt)}`}>
            {evse.live.online ? (
                <span className="badge badge-success badge-dot">Online</span>
            ) : (
                <span className="badge badge-neutral badge-dot">Offline</span>
            )}{' '}
            <span className="muted small">{timeAgo(evse.live.lastSeenAt)}</span>
        </span>
    );
}

/** Chargers as in the old portal's terminal table: terminal, station, connector types, status. */
export function ChargersTable({ chargers, stationName, empty }: {
    chargers: Evse[];
    /** Shows a Station column when given. */
    stationName?: (id: string) => string | undefined;
    empty: string;
}) {
    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Terminal</th>
                        {stationName && <th>Station</th>}
                        <th>Connectors</th>
                        <th>Make and model</th>
                        <th>Connection</th>
                        <th>Status</th>
                        <th className="num">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {chargers.map((e) => (
                        <tr key={e.id}>
                            <td>
                                <Link to={`/stations/chargers/${e.id}`} className="cell-link">
                                    {evseTitle(e)}
                                </Link>
                                {e.name && <div className="muted small code-text">{e.protocolIdentity}</div>}
                            </td>
                            {stationName && <td>{stationName(e.stationId) ?? <span className="muted">—</span>}</td>}
                            <td>
                                <div className="chips">
                                    {e.connectors.map((c) => (
                                        <span
                                            key={c.id}
                                            className={`chip${c.status === 'disabled' ? ' chip-off' : ''}`}
                                            title={c.status === 'disabled' ? 'Disabled' : undefined}
                                        >
                                            {c.connectorNumber} · {CONNECTOR_LABELS[c.connectorType]} {c.maxPowerKw} kW
                                        </span>
                                    ))}
                                </div>
                            </td>
                            <td className="nowrap">
                                {e.vendor} {e.model}
                            </td>
                            <td className="nowrap">
                                <Connection evse={e} />
                            </td>
                            <td>
                                <span className={statusBadge(e.status)}>{capitalize(e.status)}</span>
                            </td>
                            <td className="num">
                                <Link className="btn btn-secondary btn-sm" to={`/stations/chargers/${e.id}`} aria-label={`View ${evseTitle(e)}`}>
                                    View
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {chargers.length === 0 && <div className="empty">{empty}</div>}
        </div>
    );
}
