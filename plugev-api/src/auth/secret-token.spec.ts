import { newSecretToken, parseSecretToken, secretMatches } from './secret-token';

describe('secret tokens', () => {
    it('round-trips and only stores a hash', () => {
        const t = newSecretToken();
        const parsed = parseSecretToken(t.token);
        expect(parsed?.id).toBe(t.id);
        expect(t.hash).not.toContain(parsed!.secret);
        expect(secretMatches(parsed!.secret, t.hash)).toBe(true);
        expect(secretMatches(parsed!.secret + 'x', t.hash)).toBe(false);
    });

    it.each([undefined, '', 'abc', 'not-a-uuid.secretsecretsecretsecret', `${'a'.repeat(300)}`])('rejects malformed input %p', v => {
        expect(parseSecretToken(v)).toBeNull();
    });
});
