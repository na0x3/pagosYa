import type { SourceSnapshot } from './source-preview';

/** Fetch only platform uploads in Studio, never give generated code network access. */
export function createPreviewImageLoader(apiBaseUrl: string) {
  const cache = new Map<string, Promise<string>>();
  async function image(value: unknown): Promise<unknown> {
    if (typeof value !== 'string') return value;
    let filename: string | undefined;
    try {
      const url = new URL(value, new URL(apiBaseUrl, location.href));
      filename = url.pathname.match(/^\/(?:api\/)?v1\/uploads\/([a-f0-9-]+\.(?:png|jpe?g|webp|avif|gif))$/i)?.[1];
    } catch { return value; }
    if (!filename) return value;
    const url = `${apiBaseUrl.replace(/\/$/, '')}/uploads/${filename}`;
    if (!cache.has(url)) {
      const pending = (async () => {
        const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000) });
        if (!response.ok || !/^image\/(png|jpeg|webp|avif|gif)(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Imagen no disponible');
        const blob = await response.blob();
        if (blob.size > 10 * 1024 * 1024) throw new Error('Imagen demasiado grande');
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      })();
      cache.set(url, pending);
      if (cache.size > 100) cache.delete(cache.keys().next().value!);
    }
    try { return await cache.get(url)!; }
    catch { cache.delete(url); return ''; }
  }
  return async (snapshot: SourceSnapshot): Promise<SourceSnapshot> => {
    const file = snapshot.files.find(file => file.path === 'config.js');
    if (!file) return snapshot;
    let config;
    try {
      const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
      if (!match) return snapshot;
      config = JSON.parse(match[1]);
      if (!Array.isArray(config?.data?.items)) return snapshot;
    } catch { return snapshot; }
    const tasks: Array<() => Promise<void>> = [];
    for (const item of config.data.items) {
      if (!Array.isArray(item?.imageUrls)) continue;
      item.imageUrls.forEach((value: unknown, index: number) => tasks.push(async () => { item.imageUrls[index] = await image(value); }));
    }
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }));
    return { ...snapshot, files: snapshot.files.map(entry => entry === file ? { ...entry, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` } : entry) };
  };
}
