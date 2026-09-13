import { API_BASE_URL } from './api';

/** Tracking links are bearer credentials; download links expire and are rechecked by the API. */
export async function mountDigitalDownloads(root: HTMLElement, token: string) {
  root.querySelector('[data-digital-downloads]')?.remove();
  const panel = document.createElement('section');
  panel.dataset.digitalDownloads = '';
  panel.className = 'cart-fulfillment';
  root.append(panel);
  try {
    const response = await fetch(`${API_BASE_URL}/commerce/orders/${encodeURIComponent(token)}/downloads`, { cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) { panel.remove(); return; }
    const files = await response.json() as Array<{ filename: string; url: string }>;
    if (!files.length || !panel.isConnected) { panel.remove(); return; }
    const heading = document.createElement('h3'); heading.textContent = 'Tus archivos'; panel.append(heading);
    for (const file of files) {
      const link = document.createElement('a'); link.textContent = `Descargar ${file.filename}`;
      const tokenPath = file.url.match(/^\/v1\/commerce\/downloads\/([A-Za-z0-9_.-]+)$/)?.[1];
      if (!tokenPath) continue;
      link.href = `${API_BASE_URL}/commerce/downloads/${tokenPath}`;
      link.rel = 'noreferrer'; link.referrerPolicy = 'no-referrer';
      const row = document.createElement('p'); row.append(link); panel.append(row);
    }
    const note = document.createElement('p'); note.textContent = 'Los enlaces duran 15 minutos. Guarda el enlace de tu pedido para volver a descargar.'; panel.append(note);
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.textContent = 'Renovar enlaces'; refresh.onclick = () => void mountDigitalDownloads(root, token); panel.append(refresh);
  } catch { panel.textContent = 'No se pudieron cargar tus archivos. Vuelve a abrir el pedido para intentarlo otra vez.'; }
}
