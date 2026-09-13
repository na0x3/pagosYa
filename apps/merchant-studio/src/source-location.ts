/** Only public map embed endpoints may make network requests inside a source preview. */
export function sourceLocationUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const google = url.hostname === 'www.google.com';
    const supported = google && (
      /^\/maps\/embed(?:\/v1\/(?:place|view|directions|streetview|search))?\/?$/.test(url.pathname)
      || /^\/maps\/d\/(?:u\/\d+\/)?embed$/.test(url.pathname)
    ) || (google || url.hostname === 'maps.google.com') && /^\/maps\/?$/.test(url.pathname) && url.searchParams.get('output') === 'embed'
      || url.hostname === 'www.openstreetmap.org' && url.pathname === '/export/embed.html';
    return supported ? url.href : null;
  } catch { return null; }
}

export function prepareSourceLocations(doc: Document): string[] {
  const sources = new Set<string>();
  doc.querySelectorAll('iframe').forEach(original => {
    const src = sourceLocationUrl(original.getAttribute('src') || '');
    if (!src) { original.remove(); return; }
    // Rebuild the node so pasted srcdoc, event handlers and permissions cannot survive.
    const frame = doc.createElement('iframe');
    for (const attr of ['id', 'class', 'style']) {
      const value = original.getAttribute(attr);
      if (value) frame.setAttribute(attr, value);
    }
    frame.src = src;
    frame.title = original.getAttribute('title')?.trim() || 'Ubicación del negocio';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.width = '100%';
    const height = Number(original.getAttribute('height'));
    frame.height = String(Number.isFinite(height) && height >= 300 && height <= 1200 ? height : 360);
    frame.style.setProperty('width', '100%');
    frame.style.setProperty('max-width', '100%');
    frame.style.setProperty('min-height', '300px');
    frame.style.setProperty('border', '0');
    original.replaceWith(frame);
    const url = new URL(src);
    sources.add(url.origin + url.pathname);
    // The legacy embed endpoint redirects to Google's canonical /maps endpoint.
    if (url.hostname === 'maps.google.com') sources.add('https://www.google.com/maps');
  });
  return [...sources];
}
