import React from 'react';
import { Badge } from 'reactstrap';

// OCPP 1.5 and 1.6 connector statuses plus our own Online/Offline.
const STYLES = {
    available: { color: 'success', label: 'Available' },
    online: { color: 'success', label: 'Online' },
    preparing: { color: 'info', label: 'Preparing' },
    charging: { color: 'danger', label: 'Charging' },
    occupied: { color: 'danger', label: 'Occupied' }, // OCPP 1.5
    suspendedev: { color: 'warning', label: 'Suspended (EV)' },
    suspendedevse: { color: 'warning', label: 'Suspended (EVSE)' },
    finishing: { color: 'warning', label: 'Finishing' },
    reserved: { color: 'primary', label: 'Reserved' },
    faulted: { color: 'danger', label: 'Faulted' },
    unavailable: { color: 'dark', label: 'Unavailable' },
};

export function statusColor(status) {
    const s = STYLES[(status || '').toLowerCase()];
    return s ? s.color : 'secondary';
}

const StatusBadge = ({ status, pill = false }) => {
    const s = STYLES[(status || '').toLowerCase()];
    if (!s) {
        const label = status && status.toLowerCase() !== 'offline' ? status : 'Offline';
        return (
            <Badge color="secondary" pill={pill} className="text-secondary" style={{ backgroundColor: '#e9ecef' }}>
                {label}
            </Badge>
        );
    }
    return <Badge color={s.color} pill={pill}>{s.label}</Badge>;
};

export default StatusBadge;
