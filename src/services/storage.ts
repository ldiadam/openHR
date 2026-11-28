import { Bindings } from '../types';

export interface UploadFileOptions {
  key: string;
  data: ArrayBuffer | Uint8Array | string;
  contentType: string;
}

export async function putFile(
  env: Bindings,
  options: UploadFileOptions
): Promise<string> {
  if (env.R2) {
    await env.R2.put(options.key, options.data, {
      httpMetadata: { contentType: options.contentType },
    });
    return options.key;
  }

  // Local fallback: store in a simple global cache if R2 binding isn't active
  const g = globalThis as any;
  if (!g.__openhr_storage) {
    g.__openhr_storage = new Map<string, { data: any; contentType: string }>();
  }
  g.__openhr_storage.set(options.key, {
    data: options.data,
    contentType: options.contentType,
  });
  return options.key;
}

export async function getFile(
  env: Bindings,
  key: string
): Promise<{ data: ArrayBuffer | Uint8Array; contentType: string } | null> {
  if (env.R2) {
    const object = await env.R2.get(key);
    if (!object) return null;
    const data = await object.arrayBuffer();
    return {
      data,
      contentType: object.httpMetadata?.contentType || 'application/octet-stream',
    };
  }

  const g = globalThis as any;
  if (g.__openhr_storage && g.__openhr_storage.has(key)) {
    const item = g.__openhr_storage.get(key);
    return item;
  }

  return null;
}

export async function deleteFile(env: Bindings, key: string): Promise<void> {
  if (env.R2) {
    await env.R2.delete(key);
    return;
  }
  const g = globalThis as any;
  if (g.__openhr_storage) {
    g.__openhr_storage.delete(key);
  }
}

export function decodeBase64Image(
  raw: string
): { bytes: Uint8Array; contentType: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let contentType = 'image/jpeg';
  let b64 = trimmed;
  const commaIdx = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIdx > 0) {
    const mimeMatch = trimmed.slice(0, commaIdx).match(/:(.*?);/);
    if (mimeMatch) contentType = mimeMatch[1].toLowerCase();
    b64 = trimmed.slice(commaIdx + 1);
  }
  const cleanB64 = b64.replace(/\s+/g, '');
  if (!cleanB64) return null;
  try {
    const bin = atob(cleanB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/**
 * Normalizes stored image payloads, decoding legacy objects that were
 * accidentally written as UTF-8 data URL / base64 strings into raw image bytes.
 */
export function normalizeStoredImage(stored: {
  data: ArrayBuffer | Uint8Array | string;
  contentType: string;
}): { data: ArrayBuffer | Uint8Array; contentType: string } | null {
  if (typeof stored.data === 'string') {
    const decoded = decodeBase64Image(stored.data);
    return decoded
      ? { data: decoded.bytes, contentType: decoded.contentType }
      : null;
  }

  const bytes =
    stored.data instanceof Uint8Array ? stored.data : new Uint8Array(stored.data);
  if (bytes.byteLength >= 5) {
    const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(24, bytes.byteLength)));
    if (prefix.startsWith('data:') || prefix.startsWith('/9j/') || prefix.startsWith('iVBOR')) {
      const decoded = decodeBase64Image(new TextDecoder().decode(bytes));
      if (decoded) {
        return { data: decoded.bytes, contentType: decoded.contentType };
      }
    }
  }

  return {
    data: stored.data,
    contentType: stored.contentType || 'image/jpeg',
  };
}
