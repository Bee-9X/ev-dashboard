import {
    addressAllowed, CHARGER_PASSWORD, chargerPasswordMatches, clientAddress, generateChargerPassword, hashChargerPassword,
    normaliseAddressRule, parseBasicAuth,
} from './charger-credentials';

describe('charger credentials', () => {
    it('makes passwords that fit OCPP 1.6 security profiles, and different every time', () => {
        const a = generateChargerPassword();
        expect(a).toMatch(/^[A-Za-z0-9]{24}$/);
        expect(a).toMatch(CHARGER_PASSWORD);
        expect(generateChargerPassword()).not.toBe(a);
    });

    it('checks a password against its salted hash only', () => {
        const { salt, hash } = hashChargerPassword('a-charger-password-1');
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(chargerPasswordMatches('a-charger-password-1', salt, hash)).toBe(true);
        expect(chargerPasswordMatches('a-charger-password-2', salt, hash)).toBe(false);
        // the same password gets another hash with another salt
        expect(hashChargerPassword('a-charger-password-1').hash).not.toBe(hash);
    });

    it('reads HTTP Basic credentials; the password may contain a colon', () => {
        const header = `Basic ${Buffer.from('SIM-001:pa:ss').toString('base64')}`;
        expect(parseBasicAuth(header)).toEqual({ user: 'SIM-001', password: 'pa:ss' });
        expect(parseBasicAuth(undefined)).toBeNull();
        expect(parseBasicAuth('Bearer abc')).toBeNull();
        expect(parseBasicAuth(`Basic ${Buffer.from('no-colon').toString('base64')}`)).toBeNull();
    });

    it('accepts IPv4/IPv6 addresses and CIDR ranges, and nothing else', () => {
        expect(normaliseAddressRule(' 203.0.113.7 ')).toBe('203.0.113.7');
        expect(normaliseAddressRule('203.0.113.0/24')).toBe('203.0.113.0/24');
        expect(normaliseAddressRule('2001:DB8::/32')).toBe('2001:db8::/32');
        for (const bad of ['203.0.113', '203.0.113.0/33', 'example.com', '1.2.3.4/8/1', '1.2.3.4/x', '']) {
            expect(normaliseAddressRule(bad)).toBeNull();
        }
    });

    it('matches addresses against single addresses and ranges', () => {
        const rules = ['203.0.113.7', '198.51.100.0/24', '2001:db8::/32'];
        expect(addressAllowed('203.0.113.7', rules)).toBe(true);
        expect(addressAllowed('198.51.100.200', rules)).toBe(true);
        expect(addressAllowed('2001:db8::1', rules)).toBe(true);
        expect(addressAllowed('203.0.113.8', rules)).toBe(false);
        expect(addressAllowed('not-an-ip', rules)).toBe(false);
    });

    describe('the address a charger connects from', () => {
        const req = (remoteAddress: string, xff?: string) => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress } });

        it('ignores X-Forwarded-For unless a proxy is trusted, since a charger could send any', () => {
            expect(clientAddress(req('::ffff:192.0.2.1', '203.0.113.7'), 0)).toBe('192.0.2.1');
        });

        it('takes the entry our proxy added (the last one), not what the client put in front of it', () => {
            expect(clientAddress(req('127.0.0.1', '203.0.113.7'), 1)).toBe('203.0.113.7');
            expect(clientAddress(req('127.0.0.1', '10.9.9.9, 203.0.113.7'), 1)).toBe('203.0.113.7');
            expect(clientAddress(req('127.0.0.1', '10.9.9.9, 203.0.113.7, 192.0.2.5'), 2)).toBe('203.0.113.7');
            expect(clientAddress(req('127.0.0.1'), 1)).toBe('127.0.0.1');
        });
    });
});
