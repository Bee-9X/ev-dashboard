import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetSessionForTests } from '../api/session';

afterEach(() => {
    cleanup();
    localStorage.clear();
    resetSessionForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
