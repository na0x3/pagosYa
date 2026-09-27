import "./style.css";
import { fitEmbeddedDialogs } from "./embedded-dialogs";
const app = document.querySelector<HTMLDivElement>("#app")!;
const params = new URLSearchParams(location.search);
async function mount() {
  if (params.get('library') === 'templates') return (await import('./source-templates-page')).mountTemplatesPage(app);
  if (params.get('library') === 'settings') return (await import('./source-settings-page')).mountSettingsPage(app, params.get('section') as 'brand' | 'shipping' | 'domain');
  if (['marketing','integrations','experiments'].includes(params.get('library') || '')) return (await import('./source-business-workspace')).mountBusinessWorkspace(app);
  if (params.has('library')) return (await import('./source-library')).mountSourceLibrary(app);
  if (params.has('productGuide')) return (await import('./source-product-guide')).mountProductGuide(app);
  if (params.get('thumbnail') === '1') return (await import('./source-thumbnail')).mountSourceThumbnail(app);
  if (params.get('browser') === '1') return (await import('./source-browser')).mountSourceBrowser(app);
  if (params.get('source') === '1') return (await import('./source-studio')).mountSourceStudio(app);
  if (params.get('demo') === '1') return import('./demo-studio');
  return (await import('./connected-studio')).mountConnectedStudio(app);
}
fitEmbeddedDialogs();
void mount().catch(() => { app.textContent = 'No pudimos abrir el Studio. Recarga la página para volver a intentar.'; });
