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
