/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = { ...loadEnv(mode, process.cwd()), ...process.env };
    const apiOrigin = new URL(env.VITE_API_URL ?? 'http://localhost:4000/api/v1').origin;

    return {
        plugins: [react()],
        // Port 3000 matches the API's default PORTAL_URL / CORS_ORIGINS, so email links open this app
        server: { port: 3000, strictPort: true },
        preview: {
            port: 3000,
            strictPort: true,
            // Same policy as nginx.conf.template, so `npm run preview` behaves like the production image
            headers: {
                'Content-Security-Policy':
                    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; ` +
                    `font-src 'self'; connect-src 'self' ${apiOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
            },
        },
        build: { sourcemap: false },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./src/test/setup.ts'],
            css: false,
        },
    };
});
