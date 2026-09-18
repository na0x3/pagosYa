import "./style.css";
const app = document.querySelector<HTMLDivElement>("#app")!;
const params = new URLSearchParams(location.search);
async function mount() {
  if (['marketing','integrations','experiments'].includes(params.get('library') || '')) return (await import('./source-business-workspace')).mountBusinessWorkspace(app);
  if (params.has('library')) return (await import('./source-library')).mountSourceLibrary(app);
  if (params.has('productGuide')) return (await import('./source-product-guide')).mountProductGuide(app);
  if (params.get('thumbnail') === '1') return (await import('./source-thumbnail')).mountSourceThumbnail(app);
  if (params.get('browser') === '1') return (await import('./source-browser')).mountSourceBrowser(app);
  if (params.get('source') === '1') return (await import('./source-studio')).mountSourceStudio(app);
  if (params.get('demo') === '1') return import('./demo-studio');
  return (await import('./connected-studio')).mountConnectedStudio(app);
}
void mount().catch(() => { app.textContent = 'No pudimos abrir el Studio. Recarga la página para volver a intentar.'; });
