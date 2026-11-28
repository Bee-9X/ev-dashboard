import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, ListChecks, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api, describeError } from '../../../api/client';
import type { ChargerSecurity, ConnectionRefusal, Evse } from '../../../api/types';
import { ConfirmDialog, useSubmit } from '../../../components/dialogs';
import { Alert, Button, CopyButton, Modal, TextAreaField, TextField } from '../../../components/ui';
import { formatDateTime } from '../../format';
import { evseTitle, timeAgo } from '../equipment';

/** Kept in step with the API (OCPP 1.6 security profiles: 16 to 40 characters). */
export const CHARGER_PASSWORD = /^[\x21-\x7e]{16,40}$/;
const MAX_ADDRESSES = 20;

export const REFUSAL_LABELS: Record<ConnectionRefusal, string> = {
    address_not_allowed: 'it connected from an address that is not allowed',
    password_missing: 'it sent no password',
    password_wrong: 'it sent a wrong password',
    not_secured: 'it has no password or allowed addresses, and unsecured chargers are not accepted',
};

const isSoap = (evse: Evse) => evse.protocol !== 'OCPP_1_6_J';

/** This computer: what every charger seems to come from when a tunnel such as ngrok is not trusted. */
export const isLoopback = (ip: string) => ip === '::1' || ip.startsWith('127.');

type Dialog = 'password' | 'removePassword' | 'addresses';

/**
 * Connection security for one charger (spec 7.5, 11.4 "charger impersonation"): its password (OCPP-J chargers send it
 * with HTTP Basic authentication) and the addresses it may connect from (for SOAP chargers, which cannot send one).
 */
export function ChargerSecuritySection({ evse, canEdit }: { evse: Evse; canEdit: boolean }) {
    const [security, setSecurity] = useState<ChargerSecurity | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(() => {
        api.chargerSecurity(evse.id).then(
            (s) => {
                setSecurity(s);
                setError(null);
            },
            (err) => setError(describeError(err)),
        );
    }, [evse.id]);
    // the page reloads the charger every few seconds; a refused connection shows up with it
    useEffect(load, [load, evse.live?.lastSeenAt]);

    const done = (s: ChargerSecurity, message: string) => {
        setSecurity(s);
        setDialog(null);
        setNotice(message);
    };
    const soap = isSoap(evse);

    return (
        <section className="widget" aria-labelledby="charger-security">
            <div className="widget-head">
                <h2 className="widget-title" id="charger-security">
                    {security?.secured ? <ShieldCheck size={20} aria-hidden /> : <ShieldAlert size={20} aria-hidden />} Connection security
                </h2>
                {security && (
                    <span className={security.secured ? 'badge badge-success badge-dot' : 'badge badge-warning badge-dot'}>
                        {security.secured ? 'Secured' : 'Not secured'}
                    </span>
                )}
            </div>
            {error && <Alert kind="error">{error}</Alert>}
            {notice && <Alert kind="success">{notice}</Alert>}
            {security && (
                <>
                    {!security.secured && (
                        <Alert kind="warning">
                            {security.unsecuredAccepted
                                ? 'Anyone who knows this Charger ID and the charger address can connect as this charger and send it false data. '
                                : 'The platform refuses this charger until it has a password or allowed addresses. '}
                            {soap
                                ? 'SOAP chargers usually cannot send a password: allow only the address it connects from.'
                                : 'Give it a password, and enter the same password on the charger.'}
                        </Alert>
                    )}
                    <dl className="details">
                        <dt>Password</dt>
                        <dd>
                            {security.passwordSet ? (
                                <>
                                    Set {security.passwordSetAt && <span title={formatDateTime(security.passwordSetAt)}>{timeAgo(security.passwordSetAt)}</span>}
                                    <div className="muted small">
                                        The charger sends it with HTTP Basic authentication, user name{' '}
                                        <span className="code-text">{evse.protocolIdentity}</span>.
                                    </div>
                                </>
                            ) : (
                                <span className="muted">None</span>
                            )}
                        </dd>
                        <dt>Allowed addresses</dt>
                        <dd>
                            {security.allowedAddresses.length ? (
                                <ul className="plain-list" aria-label="Allowed addresses">
                                    {security.allowedAddresses.map((a) => (
                                        <li key={a} className="code-text">{a}</li>
                                    ))}
                                </ul>
                            ) : (
                                <span className="muted">Any address</span>
                            )}
                        </dd>
                        <dt>Last connected from</dt>
                        <dd className={security.lastAddress ? 'code-text' : undefined}>
                            {security.lastAddress ?? <span className="muted">Not connected yet</span>}
                        </dd>
                        {security.lastRefusal && (
                            <>
                                <dt>Last refused</dt>
                                <dd>
                                    <span title={formatDateTime(security.lastRefusal.at)}>{timeAgo(security.lastRefusal.at)}</span>
                                    {security.lastRefusal.address && (
                                        <>
                                            {' '}from <span className="code-text">{security.lastRefusal.address}</span>
                                        </>
                                    )}
                                    <div className="muted small">Because {REFUSAL_LABELS[security.lastRefusal.reason]}.</div>
                                </dd>
                            </>
                        )}
                    </dl>
                    {canEdit && (
                        <div className="row" style={{ marginTop: 14 }}>
                            <Button variant="secondary" onClick={() => setDialog('password')}>
                                <KeyRound size={16} aria-hidden /> {security.passwordSet ? 'Replace password' : 'Set password'}
                            </Button>
                            {security.passwordSet && (
                                <Button variant="secondary" onClick={() => setDialog('removePassword')}>
                                    Remove password
                                </Button>
                            )}
                            <Button variant="secondary" onClick={() => setDialog('addresses')}>
                                <ListChecks size={16} aria-hidden /> Edit allowed addresses
                            </Button>
                        </div>
                    )}
                </>
            )}

            {dialog === 'password' && security && (
                <PasswordDialog evse={evse} replacing={security.passwordSet} onClose={() => setDialog(null)} onSet={(s) => setSecurity(s)} />
            )}
            {dialog === 'removePassword' && (
                <ConfirmDialog
                    title={`Remove password: ${evseTitle(evse)}`}
                    explain={
                        security?.allowedAddresses.length
                            ? 'The charger then connects without a password, from its allowed addresses only.'
                            : 'The charger then connects without a password. Anyone who knows its Charger ID can connect as it.'
                    }
                    confirm="Remove password"
                    onClose={() => setDialog(null)}
                    onConfirm={async () => done(await api.removeChargerPassword(evse.id), 'Password removed.')}
                />
            )}
            {dialog === 'addresses' && security && (
                <AddressesDialog
                    evse={evse}
                    security={security}
                    onClose={() => setDialog(null)}
                    onSaved={(s) => done(s, s.allowedAddresses.length ? 'Allowed addresses saved.' : 'The charger may connect from any address.')}
                />
            )}
        </section>
    );
}

/** Sets a password (made by the platform unless the charger has a fixed one) and shows it once. */
function PasswordDialog({ evse, replacing, onClose, onSet }: {
    evse: Evse;
    replacing: boolean;
    onClose: () => void;
    onSet: (s: ChargerSecurity) => void;
}) {
    const [own, setOwn] = useState(false);
    const [value, setValue] = useState('');
    const [invalid, setInvalid] = useState<string | null>(null);
    const [shown, setShown] = useState<string | null>(null);
    const { busy, error, run } = useSubmit(async () => {
        const res = await api.setChargerPassword(evse.id, own ? value : undefined);
        onSet(res.security);
        setShown(res.password);
    });

    if (shown) {
        return (
            <Modal title="Charger password" onClose={onClose}>
                <Alert kind="warning">This is the only time the password is shown. Enter it on the charger now, or copy it somewhere safe.</Alert>
                <dl className="details">
                    <dt>User name</dt>
                    <dd className="code-text">{evse.protocolIdentity}</dd>
                    <dt>Password</dt>
                    <dd className="code-text" aria-label="New password">{shown}</dd>
                </dl>
                <p className="muted small">
                    {isSoap(evse)
                        ? 'Most SOAP chargers cannot send a password. If this one cannot, it is refused from now on: remove the password and use allowed addresses instead.'
                        : 'In the charger’s OCPP settings this is the Basic authentication password (security profile 1, or 2 over https/wss). An open connection was closed; the charger reconnects with the new password.'}
                </p>
                <div className="modal-actions">
                    <CopyButton text={shown} label="Copy password" />
                    <Button onClick={onClose}>Done</Button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal title={replacing ? `Replace password: ${evseTitle(evse)}` : `Set password: ${evseTitle(evse)}`} onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (own && !CHARGER_PASSWORD.test(value)) {
                        setInvalid('16 to 40 characters: letters, digits and symbols, no spaces.');
                        return;
                    }
                    setInvalid(null);
                    void run();
                }}
                noValidate
            >
                <p className="muted">
                    {replacing
                        ? 'The current password stops working at once, so the charger must get the new one straight away.'
                        : 'From now on the charger must send this password to connect.'}
                </p>
                {error && <Alert kind="error">{error}</Alert>}
                <div className="radio-row" role="radiogroup" aria-label="Password">
                    <label className="checkbox">
                        <input type="radio" name="password-kind" checked={!own} onChange={() => setOwn(false)} />
                        Make a strong password for me
                    </label>
                    <label className="checkbox">
                        <input type="radio" name="password-kind" checked={own} onChange={() => setOwn(true)} />
                        The charger has a fixed password: enter it
                    </label>
                </div>
                {own && (
                    <TextField
                        label="Charger password"
                        value={value}
                        onChange={setValue}
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={40}
                        error={invalid ?? undefined}
                        autoFocus
                    />
                )}
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        {replacing ? 'Replace password' : 'Set password'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/** One address or CIDR range per line. */
function AddressesDialog({ evse, security, onClose, onSaved }: {
    evse: Evse;
    security: ChargerSecurity;
    onClose: () => void;
    onSaved: (s: ChargerSecurity) => void;
}) {
    const [text, setText] = useState(security.allowedAddresses.join('\n'));
    const [invalid, setInvalid] = useState<string | null>(null);
    const lines = text.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    const { busy, error, run } = useSubmit(async () => onSaved(await api.setAllowedAddresses(evse.id, lines)));
    const last = security.lastAddress;
    const viaTunnel = !!last && isLoopback(last);
    const canAddLast = !!last && !viaTunnel && !lines.includes(last);
    const loopbackListed = lines.some(isLoopback);

    return (
        <Modal title={`Allowed addresses: ${evseTitle(evse)}`} onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (lines.length > MAX_ADDRESSES) {
                        setInvalid(`At most ${MAX_ADDRESSES} addresses.`);
                        return;
                    }
                    setInvalid(null);
                    void run();
                }}
                noValidate
            >
                <p className="muted">
                    The charger is refused from any other address. Use the public address of the site’s internet connection (it must not
                    change), or a range such as 203.0.113.0/24. Leave empty to allow any address.
                </p>
                {error && <Alert kind="error">{error}</Alert>}
                {invalid && <Alert kind="error">{invalid}</Alert>}
                <TextAreaField
                    label="Addresses (one per line)"
                    value={text}
                    onChange={setText}
                    hint="IPv4 or IPv6 addresses, or CIDR ranges."
                    autoFocus
                />
                {(viaTunnel || loopbackListed) && (
                    <Alert kind="warning">
                        {viaTunnel ? `The charger seems to connect from ${last}, this computer. ` : `${lines.find(isLoopback)} is this computer. `}
                        When chargers come through ngrok, that is ngrok’s address, and allowing it lets anyone in through ngrok. Set
                        OCPP_TRUSTED_PROXIES=1 in the API settings and restart the API, so it sees the charger’s real address.
                    </Alert>
                )}
                {canAddLast && (
                    <Button variant="secondary" className="btn-sm" onClick={() => setText((t) => (t.trim() ? `${t.trim()}\n${last}` : last))}>
                        Add {last} (where it last connected from)
                    </Button>
                )}
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        Save addresses
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
