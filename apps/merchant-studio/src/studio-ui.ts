const iconPaths = {
  external: '<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H3v18h18v-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v4h14v-4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m3 15 5-5 4 4 3-3 6 6"/>',
  cart: '<path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
  paperclip: '<path d="m8 12 6.7-6.7a3 3 0 0 1 4.3 4.2L10.5 18a5 5 0 0 1-7-7l8-8"/>',
  send: '<path d="m4 4 17 8-17 8 3-8-3-8Z"/><path d="M7 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  desktop: '<rect x="3" y="4" width="18" height="13" rx="1"/><path d="M9 21h6m-3-4v4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  logout: '<path d="M10 5H5v14h5m4-4 4-3-4-3m4 3H9"/>',
} as const;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export function icon(name: keyof typeof iconPaths): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

export function renderStudioLogin(state: { error: string; busy: boolean }): string {
  return `
    <main class="studio-auth">
      <section class="studio-auth__intro">
        <a class="studio-auth__brand" href="/" aria-label="pagosYa"><img src="/logo-mark.png" alt="" /><span>pagosYa</span></a>
        <span class="eyebrow">MERCHANT STUDIO</span>
        <h1>Tu tienda, dirigida en conversación.</h1>
        <p>YAPI prepara cambios privados sobre tu tienda real. Tú revisas la propuesta y decides cuándo publicarla.</p>
        <div class="auth-trust"><span>${icon("check")} Propuestas privadas</span><span>${icon("undo")} Historial recuperable</span><span>${icon("lock")} Checkout protegido</span></div>
      </section>
      <section class="studio-auth__form-wrap">
        <form class="studio-auth__form" data-login-form>
          <span class="eyebrow">ACCESO DE COMERCIO</span>
          <h2>Entrar a Merchant Studio</h2>
          <p>Usa la misma cuenta que empleas en el dashboard.</p>
          <label>Correo<input name="email" type="email" autocomplete="username" required placeholder="tu@comercio.com" /></label>
          <label>Contraseña<input name="password" type="password" autocomplete="current-password" required /></label>
          ${state.error ? `<p class="auth-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <button class="button button--publish auth-submit" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Verificando…" : "Entrar al Studio"}</button>
        </form>
      </section>
    </main>`;
}

export function studioModeNav(mode: 'website' | 'source', locked = false): string {
  return `<nav class="studio-mode-nav" aria-label="Área de edición">${[['website','Tienda actual','/'],['source','Sitio a medida','/?source=1']].map(([key,label,href]) => locked ? `<span ${mode === key ? 'aria-current="page"' : ''}>${label}</span>` : `<a href="${href}" ${mode === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

export function renderStudioComposer(options: {
  busy: boolean; attachments?: string; instruction?: string; source?: boolean;
  suggestions: Array<{ label: string; instruction: string }>;
}): string {
  const uploadLabel = options.source ? 'Adjuntar hasta 24 imágenes o videos MP4' : 'Adjuntar hasta tres imágenes';
  return `<div class="composer-wrap connected-composer">
    ${options.attachments || ''}
    <div class="suggestions" aria-label="Sugerencias">${options.suggestions.map(s => `<button type="button" data-suggestion="${escapeHtml(s.instruction)}" ${options.busy ? 'disabled' : ''}>${escapeHtml(s.label)}</button>`).join('')}</div>
    <form class="composer" data-composer>
      <label for="agent-command" class="sr-only">Indicación para YAPI</label>
      <textarea id="agent-command" name="command" rows="2" maxlength="${options.source ? 12000 : 8000}" placeholder="${options.source ? 'Cuéntame cómo quieres tu sitio…' : 'Describe qué quieres cambiar…'}" ${options.busy ? 'disabled' : ''}>${escapeHtml(options.instruction || '')}</textarea>
      <div class="composer__tools"><div><button class="icon-button" type="button" data-action="open-upload" aria-label="${uploadLabel}" ${options.busy ? 'disabled' : ''}>${icon('paperclip')}</button><span class="model-label">YAPI · ${options.source ? 'sitio a medida' : 'tienda real'}</span></div><button class="send-button" type="submit" aria-label="Enviar a YAPI" ${options.busy ? 'disabled' : ''}>${icon('send')}</button></div>
    </form>
    <input class="sr-only" type="file" accept="${options.source ? 'image/png,image/jpeg,image/webp,video/mp4,.mp4' : 'image/*'}" multiple data-image-input aria-label="${options.source ? 'Seleccionar hasta 24 imágenes o videos MP4' : 'Seleccionar hasta tres imágenes'}" />
  </div>`;
}
