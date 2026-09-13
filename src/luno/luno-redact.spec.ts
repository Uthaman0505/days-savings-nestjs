import { assertNoSecrets, redactSecrets } from './luno-redact';

describe('luno-redact', () => {
  const secret = 'super-secret-value-xyz';
  const keyId = 'luno-key-id-abc12345';

  it('redacts API secrets, key ids, and Basic auth headers', () => {
    const token = 'abcdefghijkl==';
    const raw = `Authorization: Basic ${token} LUNO_API_KEY_SECRET=${secret} id=${keyId}`;
    const safe = redactSecrets(raw, [secret, keyId]);
    expect(safe).not.toContain(secret);
    expect(safe).not.toContain(keyId);
    expect(safe).not.toContain(token);
    expect(safe).toContain('[REDACTED]');
    expect(redactSecrets(`Basic ${token}`)).toBe('Basic [REDACTED]');
    expect(() => assertNoSecrets(safe, secret, keyId)).not.toThrow();
  });

  it('throws when a secret is still present', () => {
    expect(() => assertNoSecrets(`keep ${secret}`, secret, keyId)).toThrow(
      'SECRET_LEAK',
    );
  });
});
