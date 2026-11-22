import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthProvider';

export function renderApp(path = '/') {
    const user = userEvent.setup();
    const result = render(
        <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
                <App />
            </AuthProvider>
        </MemoryRouter>,
    );
    return { user, ...result };
}
