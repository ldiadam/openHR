import { Context, Next } from 'hono';
import { Bindings, JwtPayload, UserRole } from '../types';

const DEFAULT_SECRET = 'openhr-secret-key-change-in-production-min-32-chars-long';

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, expectedHash: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === expectedHash;
}

export async function signJwt(payload: Omit<JwtPayload, 'exp'>, secretStr: string = DEFAULT_SECRET, expiresInSecs: number = 7 * 86400): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSecs;
  const fullPayload: JwtPayload = { ...payload, exp };

  const encodeBase64Url = (obj: any) => {
    const json = JSON.stringify(obj);
    const bytes = enc.encode(json);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const headerB64 = encodeBase64Url(header);
  const payloadB64 = encodeBase64Url(fullPayload);
  const dataToSign = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretStr),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  const sigBytes = new Uint8Array(signatureBuffer);
  let sigBinary = '';
  for (let i = 0; i < sigBytes.byteLength; i++) {
    sigBinary += String.fromCharCode(sigBytes[i]);
  }
  const sigB64 = btoa(sigBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${dataToSign}.${sigB64}`;
}

export async function verifyJwt(token: string, secretStr: string = DEFAULT_SECRET): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const dataToVerify = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretStr),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const b64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const rawSig = atob(b64 + pad);
    const sigArray = new Uint8Array(rawSig.length);
    for (let i = 0; i < rawSig.length; i++) {
      sigArray[i] = rawSig.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify('HMAC', key, sigArray, enc.encode(dataToVerify));
    if (!isValid) return null;

    const b64Payload = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padPayload = b64Payload.length % 4 === 0 ? '' : '='.repeat(4 - (b64Payload.length % 4));
    const decodedPayload = atob(b64Payload + padPayload);
    const parsed: JwtPayload = JSON.parse(decodedPayload);

    if (parsed.exp && parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export interface AuthContext {
  user: JwtPayload;
}

export async function authMiddleware(c: Context<{ Bindings: Bindings; Variables: AuthContext }>, next: Next) {
  let token: string | undefined;
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    const queryToken = c.req.query('token');
    if (queryToken) {
      token = queryToken;
    }
  }

  if (!token) {
    return c.json({ error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const secret = c.env.JWT_SECRET || DEFAULT_SECRET;
  const payload = await verifyJwt(token, secret);

  if (!payload) {
    return c.json({ error: 'Unauthorized: Token is invalid or expired' }, 401);
  }

  c.set('user', payload);
  await next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return async (c: Context<{ Bindings: Bindings; Variables: AuthContext }>, next: Next) => {
    const user = c.get('user');
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({ error: 'Forbidden: Insufficient privileges' }, 403);
    }
    await next();
  };
}

export function sanitizeEmployeeByRole(
  emp: any,
  role: UserRole,
  currentEmployeeId?: string | null
): any {
  if (!emp) return emp;
  const isSelf = currentEmployeeId && emp.id === currentEmployeeId;
  const canSeeSalary = role === 'owner_admin' || role === 'finance' || isSelf;

  if (!canSeeSalary) {
    const {
      base_salary,
      fixed_allowances,
      fixed_allowances_detail,
      bank_account_number,
      bank_account_holder,
      bank_swift_code,
      bank_branch_name,
      bank_branch_code,
      bank_branch_address,
      bpjs_wage_basis,
      ...rest
    } = emp;
    return rest;
  }
  return emp;
}
