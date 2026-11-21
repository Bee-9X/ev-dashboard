import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChargerConsole from './ChargerConsole';
import * as api from '../../../api';

jest.mock('../../../api', () => ({
    fetchCommands: jest.fn(),
    fetchTransactions: jest.fn(),
    fetchMessages: jest.fn(),
    fetchReport: jest.fn(),
    sendCommand: jest.fn(),
}));

const charger = {
    identity: 'CB-1',
    name: 'Galle Road',
    registered: true,
    protocol: 'ocpp1.5-soap',
    backend: 'SOAP',
    status: 'Occupied',
    endpoint: 'http://10.0.0.5:8080/',
    lastSeenAt: '2026-11-20T10:00:00Z',
    info: { chargePointVendor: 'Setec', chargePointModel: 'S1', firmwareVersion: '1.2' },
    connectors: [
        { connectorId: 0, status: 'Available' },
        {
            connectorId: 1, status: 'Occupied', errorCode: 'NoError',
            meter: { Power_Active_Import: { value: 6000, unit: 'W' }, Energy_Active_Import_Register: { value: 1500, unit: 'Wh' } },
        },
    ],
};

beforeEach(() => {
    api.fetchCommands.mockResolvedValue([
        { commandId: 'c1', action: 'Reset', state: 'Rejected', payload: { type: 'Soft' }, createdAt: '2026-11-20T10:00:00Z' },
    ]);
    api.fetchTransactions.mockResolvedValue([
        { chargerIdentity: 'CB-1', transactionId: 42, connectorId: 1, idTag: 'RFID1', status: 'Active', startedAt: '2026-11-20T10:00:00Z' },
    ]);
    api.fetchMessages.mockResolvedValue([
        { _id: 'm1', createdAt: '2026-11-20T10:00:00Z', direction: 'in', kind: 'CALL', action: 'Heartbeat', payload: {} },
    ]);
    api.fetchReport.mockResolvedValue({
        generatedAt: '2026-11-20T10:00:00Z',
        configuration: [{ key: 'HeartbeatInterval', value: '30', readonly: false }],
        configurationFetchedAt: '2026-11-20T10:00:00Z',
        checklist: [{ id: 'connect', title: 'Charger connects', status: 'verified', evidence: '1 boot' }],
    });
    api.sendCommand.mockResolvedValue({ action: 'RemoteStopTransaction', state: 'Accepted' });
});

test('renders charger details, connectors, history and checklist', async () => {
    render(<ChargerConsole charger={charger} />);

    expect(screen.getByText('Galle Road')).toBeInTheDocument();
    expect(screen.getByText('6000 W')).toBeInTheDocument();
    expect(screen.getByText('http://10.0.0.5:8080/')).toBeInTheDocument();
    // OCPP 1.5 has no TriggerMessage
    expect(screen.queryByText('Trigger')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Rejected')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Phase 0 checklist'));
    expect(await screen.findByText('Charger connects')).toBeInTheDocument();
});

test('stop uses the active transaction and shows the real outcome', async () => {
    render(<ChargerConsole charger={charger} />);
    await waitFor(() => expect(screen.getByPlaceholderText('tx 42')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Stop charging'));
    await waitFor(() => expect(api.sendCommand).toHaveBeenCalledWith('CB-1', 'RemoteStopTransaction', { transactionId: 42 }));
    expect(await screen.findByText(/Watch the connector status/)).toBeInTheDocument();
});

test('dangerous commands ask for confirmation', async () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ChargerConsole charger={charger} />);
    await screen.findByText('Rejected'); // let the initial data load settle
    fireEvent.click(screen.getByText('Hard reset'));
    expect(confirm).toHaveBeenCalled();
    expect(api.sendCommand).not.toHaveBeenCalledWith('CB-1', 'Reset', { type: 'Hard' });
    confirm.mockRestore();
});
