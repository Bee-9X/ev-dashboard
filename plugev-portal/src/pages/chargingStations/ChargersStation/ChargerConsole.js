import React, { useCallback, useEffect, useState } from 'react';
import classnames from 'classnames';
import {
    Badge, Button, ButtonGroup, Col, Input, Label, Nav, NavItem, NavLink, Row, TabContent, TabPane, Table,
} from 'reactstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChargingStation } from '@fortawesome/free-solid-svg-icons';

import Widget from '../../../components/Widget';
import StatusBadge from '../../../components/StatusBadge/StatusBadge';
import {
    fetchCommands, fetchMessages, fetchReport, fetchTransactions, sendCommand,
} from '../../../api';

const TRIGGERABLE = ['StatusNotification', 'Heartbeat', 'MeterValues', 'BootNotification', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification'];

const COMMAND_STATE_COLORS = {
    Accepted: 'success', Completed: 'success', Unlocked: 'success',
    Scheduled: 'warning', Sent: 'info', Pending: 'info',
    Rejected: 'danger', Failed: 'danger', Timeout: 'danger', UnlockFailed: 'danger',
};

const CHECK_COLORS = { verified: 'success', partial: 'warning', failed: 'danger' };

const fmtTime = v => (v ? new Date(v).toLocaleString() : '—');

function meterReading(connector, key) {
    const m = connector?.meter?.[key];
    if (!m || m.value === undefined) return '—';
    return `${m.value} ${m.unit || ''}`.trim();
}

function summarize(obj) {
    if (obj === undefined || obj === null) return '';
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

const ChargerConsole = ({ charger, onChanged }) => {
    const identity = charger.identity;
    const plugConnectors = charger.connectors.filter(c => c.connectorId > 0);
    const isOcpp15 = (charger.protocol || '').includes('1.5');

    const [connectorId, setConnectorId] = useState(plugConnectors[0]?.connectorId || 1);
    const [idTag, setIdTag] = useState('CLIENT_USER');
    const [stopTxId, setStopTxId] = useState('');
    const [configKey, setConfigKey] = useState('');
    const [configValue, setConfigValue] = useState('');
    const [trigger, setTrigger] = useState('StatusNotification');
    const [busy, setBusy] = useState(null);
    const [lastResult, setLastResult] = useState(null);

    const [tab, setTab] = useState('commands');
    const [commands, setCommands] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [messages, setMessages] = useState([]);
    const [report, setReport] = useState(null);
    const [loadError, setLoadError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const [cmds, txs, msgs] = await Promise.all([
                fetchCommands(identity, 20), fetchTransactions(identity, 20), fetchMessages(identity, 60),
            ]);
            setCommands(cmds);
            setTransactions(txs);
            setMessages(msgs);
            setLoadError(null);
        } catch (e) {
            setLoadError(e.message);
        }
    }, [identity]);

    const loadReport = useCallback(async () => {
        try {
            setReport(await fetchReport(identity));
        } catch (e) {
            setLoadError(e.message);
        }
    }, [identity]);

    useEffect(() => {
        setReport(null);
        refresh();
        loadReport();
        const t = setInterval(refresh, 5000);
        return () => clearInterval(t);
    }, [refresh, loadReport]);

    const activeTx = transactions.find(t => t.status === 'Active' && t.connectorId === Number(connectorId))
        || transactions.find(t => t.status === 'Active');

    const run = async (action, payload, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(action);
        try {
            const cmd = await sendCommand(identity, action, payload);
            setLastResult(cmd);
        } catch (e) {
            setLastResult({ action, state: 'Error', error: e.message });
        } finally {
            setBusy(null);
            refresh();
            loadReport();
            if (onChanged) onChanged();
        }
    };

    const cmdButton = (label, action, payload, color = 'default', confirmText) => (
        <Button
            color={color}
            size="sm"
            className="mr-2 mb-2"
            disabled={busy !== null}
            onClick={() => run(action, payload, confirmText)}
        >
            {busy === action ? 'Waiting…' : label}
        </Button>
    );

    return (
        <>
            <Row>
                <Col lg={6} md={12} className="mb-4">
                    <Widget title={<h5>Charger <span className="fw-semi-bold">Details</span></h5>}>
                        <div className="d-flex align-items-center mb-3 mt-3">
                            <div className="mr-3" style={{ fontSize: '3rem', color: '#1870DC' }}>
                                <FontAwesomeIcon icon={faChargingStation} />
                            </div>
                            <div>
                                <h4 className="mb-1 fw-bold">{charger.name} <small className="text-muted">({identity})</small></h4>
                                <Badge color={charger.backend === 'SOAP' ? 'primary' : 'info'} className="mr-2">
                                    {charger.protocol || charger.ocppVersion}
                                </Badge>
                                <StatusBadge status={charger.status} />
                                {!charger.registered && <Badge color="warning" className="ml-2">Unregistered</Badge>}
                            </div>
                        </div>
                        <Table className="table-bordered table-sm">
                            <tbody>
                                <tr><td className="fw-semi-bold" style={{ width: '40%' }}>Vendor / Model</td><td>{charger.info?.chargePointVendor || '—'} / {charger.info?.chargePointModel || '—'}</td></tr>
                                <tr><td className="fw-semi-bold">Serial (box / point)</td><td>{charger.info?.chargeBoxSerialNumber || '—'} / {charger.info?.chargePointSerialNumber || '—'}</td></tr>
                                <tr><td className="fw-semi-bold">Firmware</td><td>{charger.info?.firmwareVersion || '—'}</td></tr>
                                <tr><td className="fw-semi-bold">Source IP</td><td><code>{charger.ip || '—'}</code></td></tr>
                                {charger.backend === 'SOAP' && (
                                    <tr>
                                        <td className="fw-semi-bold">Command endpoint</td>
                                        <td><code>{charger.endpoint || 'not advertised — commands cannot be pushed'}</code></td>
                                    </tr>
                                )}
                                <tr><td className="fw-semi-bold">Last seen</td><td>{fmtTime(charger.lastSeenAt)}</td></tr>
                                <tr><td className="fw-semi-bold">Last heartbeat</td><td>{fmtTime(charger.lastHeartbeatAt)}</td></tr>
                                <tr><td className="fw-semi-bold">Last boot</td><td>{fmtTime(charger.lastBootAt)}</td></tr>
                            </tbody>
                        </Table>

                        <h6 className="fw-semi-bold mt-3">Connectors</h6>
                        <Table className="table-sm">
                            <thead>
                                <tr><th>#</th><th>Status</th><th>Error</th><th>Energy</th><th>Power</th><th>Updated</th></tr>
                            </thead>
                            <tbody>
                                {charger.connectors.length === 0 && (
                                    <tr><td colSpan={6} className="text-muted">No StatusNotification received yet</td></tr>
                                )}
                                {charger.connectors.map(c => (
                                    <tr key={c.connectorId}>
                                        <td>{c.connectorId === 0 ? '0 (unit)' : c.connectorId}</td>
                                        <td><StatusBadge status={c.status} /></td>
                                        <td>{c.errorCode && c.errorCode !== 'NoError' ? <span className="text-danger">{c.errorCode}{c.vendorErrorCode ? ` (${c.vendorErrorCode})` : ''}</span> : '—'}</td>
                                        <td>{meterReading(c, 'Energy_Active_Import_Register')}</td>
                                        <td>{meterReading(c, 'Power_Active_Import')}</td>
                                        <td><small>{fmtTime(c.updatedAt)}</small></td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </Widget>
                </Col>

                <Col lg={6} md={12} className="mb-4">
                    <Widget title={<h5>Remote <span className="fw-semi-bold">Operations</span></h5>}>
                        <Row className="mt-3">
                            <Col sm={4}>
                                <Label for="cc-connector" className="fw-semi-bold">Connector</Label>
                                <Input id="cc-connector" type="number" min={1} value={connectorId}
                                    onChange={e => setConnectorId(e.target.value)} />
                            </Col>
                            <Col sm={8}>
                                <Label for="cc-idtag" className="fw-semi-bold">idTag (RFID)</Label>
                                <Input id="cc-idtag" type="text" maxLength={20} value={idTag} onChange={e => setIdTag(e.target.value)} />
                            </Col>
                        </Row>

                        <h6 className="fw-semi-bold mt-3">Charging</h6>
                        {cmdButton('Start charging', 'RemoteStartTransaction', { idTag, connectorId: Number(connectorId) }, 'success')}
                        <div className="d-inline-flex align-items-center mb-2">
                            <Input
                                type="number"
                                bsSize="sm"
                                style={{ width: 130 }}
                                className="mr-2"
                                placeholder={activeTx ? `tx ${activeTx.transactionId}` : 'transaction id'}
                                value={stopTxId}
                                onChange={e => setStopTxId(e.target.value)}
                            />
                            <Button
                                color="danger"
                                size="sm"
                                disabled={busy !== null || (!stopTxId && !activeTx)}
                                onClick={() => run('RemoteStopTransaction', { transactionId: Number(stopTxId || activeTx.transactionId) })}
                            >
                                {busy === 'RemoteStopTransaction' ? 'Waiting…' : 'Stop charging'}
                            </Button>
                        </div>

                        <h6 className="fw-semi-bold mt-2">Maintenance</h6>
                        {cmdButton('Soft reset', 'Reset', { type: 'Soft' }, 'warning', `Soft reset ${identity}? Active sessions will be stopped.`)}
                        {cmdButton('Hard reset', 'Reset', { type: 'Hard' }, 'danger', `HARD reset ${identity}? The charger will reboot immediately.`)}
                        {cmdButton('Unlock connector', 'UnlockConnector', { connectorId: Number(connectorId) }, 'default', `Unlock connector ${connectorId} on ${identity}?`)}
                        <br />
                        {cmdButton('Set inoperative', 'ChangeAvailability', { connectorId: Number(connectorId), type: 'Inoperative' }, 'default', `Take connector ${connectorId} out of service?`)}
                        {cmdButton('Set operative', 'ChangeAvailability', { connectorId: Number(connectorId), type: 'Operative' })}
                        {cmdButton('Whole unit inoperative', 'ChangeAvailability', { connectorId: 0, type: 'Inoperative' }, 'default', `Take the whole charger ${identity} out of service?`)}
                        {cmdButton('Whole unit operative', 'ChangeAvailability', { connectorId: 0, type: 'Operative' })}
                        {cmdButton('Clear auth cache', 'ClearCache', {})}

                        <h6 className="fw-semi-bold mt-2">Configuration</h6>
                        {cmdButton('Read configuration', 'GetConfiguration', {})}
                        <div className="d-flex mb-2">
                            <Input bsSize="sm" className="mr-2" placeholder="key" value={configKey} onChange={e => setConfigKey(e.target.value)} />
                            <Input bsSize="sm" className="mr-2" placeholder="value" value={configValue} onChange={e => setConfigValue(e.target.value)} />
                            <Button size="sm" color="default" disabled={busy !== null || !configKey}
                                onClick={() => run('ChangeConfiguration', { key: configKey, value: configValue }, `Set ${configKey} = ${configValue} on ${identity}?`)}>
                                {busy === 'ChangeConfiguration' ? 'Waiting…' : 'Change'}
                            </Button>
                        </div>

                        {!isOcpp15 && (
                            <div className="d-flex mb-2">
                                <Input type="select" bsSize="sm" className="mr-2" value={trigger} onChange={e => setTrigger(e.target.value)}>
                                    {TRIGGERABLE.map(t => <option key={t} value={t}>{t}</option>)}
                                </Input>
                                <Button size="sm" color="default" disabled={busy !== null}
                                    onClick={() => run('TriggerMessage', { requestedMessage: trigger })}>
                                    {busy === 'TriggerMessage' ? 'Waiting…' : 'Trigger'}
                                </Button>
                            </div>
                        )}

                        {lastResult && (
                            <div className="mt-2 p-2" style={{ background: '#f4f6fa', borderRadius: 6 }}>
                                <strong>{lastResult.action}</strong>{' '}
                                <Badge color={COMMAND_STATE_COLORS[lastResult.state] || 'secondary'}>{lastResult.state}</Badge>
                                {lastResult.error && <div className="text-danger small mt-1">{lastResult.error}</div>}
                                {lastResult.state === 'Accepted' && (
                                    <div className="text-muted small mt-1">
                                        Accepted means the charger agreed to do it. Watch the connector status for the actual result.
                                    </div>
                                )}
                            </div>
                        )}
                    </Widget>
                </Col>
            </Row>

            <Widget title={<h5>Diagnostics <span className="fw-semi-bold">&amp; Evidence</span></h5>}>
                {loadError && <div className="text-danger mb-2">Could not load data: {loadError}</div>}
                <Nav tabs className="mt-2">
                    {[
                        ['commands', 'Command history'],
                        ['sessions', 'Sessions'],
                        ['messages', 'OCPP messages'],
                        ['config', 'Configuration'],
                        ['checklist', 'Phase 0 checklist'],
                    ].map(([id, label]) => (
                        <NavItem key={id}>
                            <NavLink className={classnames({ active: tab === id })} style={{ cursor: 'pointer' }} onClick={() => setTab(id)}>
                                {label}
                            </NavLink>
                        </NavItem>
                    ))}
                </Nav>
                <TabContent activeTab={tab} className="pt-3">
                    <TabPane tabId="commands">
                        <Table className="table-sm">
                            <thead><tr><th>Time</th><th>Command</th><th>Payload</th><th>Outcome</th><th>Detail</th></tr></thead>
                            <tbody>
                                {commands.length === 0 && <tr><td colSpan={5} className="text-muted">No commands sent yet</td></tr>}
                                {commands.map(c => (
                                    <tr key={c.commandId}>
                                        <td><small>{fmtTime(c.createdAt)}</small></td>
                                        <td>{c.action}</td>
                                        <td><small><code>{summarize(c.payload)}</code></small></td>
                                        <td><Badge color={COMMAND_STATE_COLORS[c.state] || 'secondary'}>{c.state}</Badge></td>
                                        <td><small>{c.error || summarize(c.response)}</small></td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </TabPane>

                    <TabPane tabId="sessions">
                        <Table className="table-sm">
                            <thead><tr><th>Tx</th><th>Connector</th><th>idTag</th><th>Start</th><th>Stop</th><th>Energy</th><th>Status</th><th>Reason / notes</th></tr></thead>
                            <tbody>
                                {transactions.length === 0 && <tr><td colSpan={8} className="text-muted">No sessions recorded</td></tr>}
                                {transactions.map(t => (
                                    <tr key={`${t.chargerIdentity}-${t.transactionId}`}>
                                        <td>{t.transactionId}</td>
                                        <td>{t.connectorId}</td>
                                        <td>{t.idTag || '—'}</td>
                                        <td><small>{fmtTime(t.startedAt)}</small></td>
                                        <td><small>{fmtTime(t.stoppedAt)}</small></td>
                                        <td>{t.energyWh !== undefined && t.energyWh !== null ? `${(t.energyWh / 1000).toFixed(3)} kWh` : '—'}</td>
                                        <td><Badge color={t.status === 'Completed' ? 'success' : t.status === 'Active' ? 'info' : 'warning'}>{t.status}</Badge></td>
                                        <td><small>{[t.stopReason, ...(t.notes || [])].filter(Boolean).join('; ')}</small></td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </TabPane>

                    <TabPane tabId="messages">
                        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                            <Table className="table-sm" style={{ fontSize: '0.8rem' }}>
                                <thead><tr><th>Time</th><th>Dir</th><th>Type</th><th>Action</th><th>Payload</th></tr></thead>
                                <tbody>
                                    {messages.map(m => (
                                        <tr key={m._id}>
                                            <td className="text-nowrap">{new Date(m.createdAt).toLocaleTimeString()}</td>
                                            <td>{m.direction === 'in' ? '⬅ in' : 'out ➡'}</td>
                                            <td>{m.kind}</td>
                                            <td>{m.action}</td>
                                            <td><code>{summarize(m.error || m.payload)}</code></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>
                    </TabPane>

                    <TabPane tabId="config">
                        {!report || report.configuration.length === 0 ? (
                            <p className="text-muted">No configuration read yet. Use “Read configuration”.</p>
                        ) : (
                            <>
                                <p className="text-muted small">Read {fmtTime(report.configurationFetchedAt)}</p>
                                <Table className="table-sm">
                                    <thead><tr><th>Key</th><th>Value</th><th>Read-only</th></tr></thead>
                                    <tbody>
                                        {report.configuration.map(k => (
                                            <tr key={k.key}>
                                                <td><code>{k.key}</code></td>
                                                <td style={{ wordBreak: 'break-all' }}>{k.value}</td>
                                                <td>{k.readonly ? 'yes' : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </>
                        )}
                    </TabPane>

                    <TabPane tabId="checklist">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="text-muted small">
                                Proof-of-concept checks from spec §7.6, judged from what this charger actually did.
                                {report && ` Generated ${fmtTime(report.generatedAt)}.`}
                            </span>
                            <ButtonGroup>
                                <Button size="sm" color="default" onClick={loadReport}>Refresh</Button>
                                <Button size="sm" color="default" disabled={!report} onClick={() => {
                                    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                                    const a = document.createElement('a');
                                    a.href = URL.createObjectURL(blob);
                                    a.download = `phase0-report-${identity}-${new Date().toISOString().slice(0, 10)}.json`;
                                    a.click();
                                    URL.revokeObjectURL(a.href);
                                }}>Download report</Button>
                            </ButtonGroup>
                        </div>
                        <Table className="table-sm">
                            <thead><tr><th>Check</th><th>Result</th><th>Evidence</th></tr></thead>
                            <tbody>
                                {(report?.checklist || []).map(c => (
                                    <tr key={c.id}>
                                        <td>{c.title}</td>
                                        <td><Badge color={CHECK_COLORS[c.status] || 'secondary'}>{c.status}</Badge></td>
                                        <td><small>{c.evidence}</small></td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </TabPane>
                </TabContent>
            </Widget>
        </>
    );
};

export default ChargerConsole;
