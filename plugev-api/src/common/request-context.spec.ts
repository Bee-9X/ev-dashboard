import { AsyncLocalStorage } from 'node:async_hooks';
import { currentRequest, requestContext, runOutsideRequest } from './request-context';

describe('runOutsideRequest', () => {
    it('runs work, and what it awaits, without the request context of whoever started it', async () => {
        const other = new AsyncLocalStorage<string>(); // stands in for nestjs-pino's own store
        const seen = await new Promise<unknown[]>(resolve => {
            requestContext.run({ correlationId: 'req-1' }, () => other.run('request logger', () => {
                expect(currentRequest()?.correlationId).toBe('req-1');
                runOutsideRequest(() => {
                    void (async () => {
                        await new Promise(r => setTimeout(r, 5));
                        resolve([currentRequest(), other.getStore()]);
                    })();
                });
            }));
        });
        expect(seen).toEqual([undefined, undefined]);
    });

    it('leaves the caller in its own context', () => {
        requestContext.run({ correlationId: 'req-2' }, () => {
            runOutsideRequest(() => undefined);
            expect(currentRequest()?.correlationId).toBe('req-2');
        });
    });
});
