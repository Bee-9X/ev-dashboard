import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { Alert, Button, Modal, TextAreaField } from './ui';

/** Runs a dialog's action: keeps the dialog busy, and shows the API's reason when it fails. */
export function useSubmit(fn: () => Promise<void>) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(describeError(err));
            setBusy(false);
        }
    };
    return { busy, error, run };
}

/** Asks for a reason that goes to the audit log. */
export function ReasonDialog({ title, explain, confirm, danger, onClose, onConfirm }: {
    title: string;
    explain: string;
    confirm: string;
    danger?: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
}) {
    const [reason, setReason] = useState('');
    const { busy, error, run } = useSubmit(() => onConfirm(reason.trim()));
    return (
        <Modal title={title} onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (reason.trim()) void run();
                }}
                noValidate
            >
                <p className="muted">{explain}</p>
                {error && <Alert kind="error">{error}</Alert>}
                <TextAreaField label="Reason" value={reason} onChange={setReason} maxLength={500} hint="Kept in the audit log." autoFocus required />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!reason.trim()}>
                        {confirm}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export function ConfirmDialog({ title, explain, confirm, danger = true, onClose, onConfirm }: {
    title: string;
    explain: string;
    confirm: string;
    danger?: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    const { busy, error, run } = useSubmit(onConfirm);
    return (
        <Modal title={title} onClose={onClose} busy={busy}>
            <p className="muted">{explain}</p>
            {error && <Alert kind="error">{error}</Alert>}
            <div className="modal-actions">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={() => void run()}>
                    {confirm}
                </Button>
            </div>
        </Modal>
    );
}

/** "1–20 of 45" with Previous and Next. */
export function Pagination({ page, pageSize, total, loading, onPage }: {
    page: number;
    pageSize: number;
    total: number;
    loading?: boolean;
    onPage: (page: number) => void;
}) {
    if (!total) return null;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    return (
        <div className="pagination">
            <span>
                {from}–{to} of {total}
            </span>
            <div className="row">
                <Button variant="secondary" className="btn-sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
                    Previous
                </Button>
                <Button variant="secondary" className="btn-sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>
                    Next
                </Button>
            </div>
        </div>
    );
}
