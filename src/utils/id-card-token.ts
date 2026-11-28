async function computeBadgeHmacHex(secret: string, employeeId: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'openhr-fallback-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`employee-id-card:${employeeId}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

export async function signBadgeToken(secret: string, employeeId: string): Promise<string> {
  return computeBadgeHmacHex(secret, employeeId);
}

export async function verifyBadgeToken(
  secret: string,
  employeeId: string,
  token: string
): Promise<boolean> {
  if (!token || typeof token !== 'string' || !employeeId) return false;
  const expected = await computeBadgeHmacHex(secret, employeeId);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
