const SECRET_KEYS = [
  'LUNO_API_KEY_SECRET',
  'LUNO_API_KEY_ID',
  'Authorization',
  'authorization',
];

export function redactSecrets(
  text: string,
  extras: Array<string | null | undefined> = [],
): string {
  let next = text;
  next = next.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
  for (const extra of extras) {
    if (extra && extra.length >= 4) {
      next = next.split(extra).join('[REDACTED]');
    }
  }
  for (const key of SECRET_KEYS) {
    const pattern = new RegExp(`${key}\\s*[:=]\\s*[^\\s,;]+`, 'gi');
    next = next.replace(pattern, `${key}=[REDACTED]`);
  }
  return next;
}

export function assertNoSecrets(
  text: string,
  secret: string | null | undefined,
  keyId: string | null | undefined,
): void {
  if (secret && text.includes(secret)) {
    throw new Error('SECRET_LEAK');
  }
  if (keyId && keyId.length > 8 && text.includes(keyId)) {
    throw new Error('SECRET_LEAK');
  }
}
