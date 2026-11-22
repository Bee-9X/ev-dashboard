import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@fontsource/open-sans/latin-300.css';
import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';
import './styles/global.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <App />
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>,
);
