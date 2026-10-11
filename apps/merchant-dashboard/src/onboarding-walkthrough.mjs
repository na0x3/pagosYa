// First-store walkthrough (spec 2026-10-11 Elige tu estilo, C1): one question per screen; the store exists from step 1.
import { escapeHtml } from './html.mjs';

export const WALKTHROUGH_STEPS = [
  { id: 'name', title: '¿Cómo se llama tu negocio?', optional: false },
  { id: 'what', title: '¿Qué vendes o a qué te dedicas?', optional: false },
  { id: 'logo', title: '¿Tienes logo?', optional: true },
  { id: 'photos', title: 'Sube fotos de tu negocio', optional: true },
  { id: 'products', title: 'Agrega hasta 5 productos', optional: true },
  { id: 'story', title: 'Tu historia', optional: true },
  { id: 'contact', title: '¿Cómo te contactan?', optional: true },
];
const REQUIRED = { name: 'Escribe el nombre de tu negocio.', what: 'Cuéntanos en una frase qué vendes.' };
const LAST = WALKTHROUGH_STEPS.length - 1;

export function nextState(state, action) {
  const step = WALKTHROUGH_STEPS[state.step];
  if (action.type === 'field') return { ...state, error: null, values: { ...state.values, [action.name]: action.value } };
  if (action.type === 'back') return { ...state, error: null, step: Math.max(0, state.step - 1) };
  if (action.type === 'skip') return step.optional ? { ...state, error: null, step: Math.min(LAST, state.step + 1) } : state;
  if (action.type === 'next') {
    if (!step.optional && !String(state.values[step.id] || '').trim()) return { ...state, error: REQUIRED[step.id] };
    return { ...state, error: null, step: Math.min(LAST, state.step + 1) };
  }
  return state;
}

export function productDrafts(rows) {
  return rows.map(row => {
    const name = String(row.name || '').trim().slice(0, 120);
    // "Bs 45", "45,50" and "1.200": a dot followed by exactly three digits is a thousands separator.
    const cleaned = String(row.price || '').replace(/bs\.?/i, '').trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const amount = Math.round(Number(cleaned) * 100);
    return name && cleaned && Number.isFinite(amount) && amount > 0 ? { name, amount, imageUrls: row.imageUrl ? [row.imageUrl] : [] } : null;
  }).filter(Boolean).slice(0, 5);
}

const field = (step, values) => {
  const v = name => escapeHtml(String(values[name] || ''));
  switch (step.id) {
    case 'name': return `<input class="wt-input" name="name" maxlength="120" autocomplete="organization" placeholder="Café Buna" value="${v('name')}" autofocus><p class="wt-aside">¿Vienes de Shopify? <button class="link" type="button" data-open-shopify-import>Trae tu tienda</button></p>`;
    case 'what': return `<textarea class="wt-input" name="what" maxlength="300" rows="3" placeholder="Café de especialidad tostado en Sopocachi" autofocus>${v('what')}</textarea>`;
    case 'logo': return `<label class="wt-drop"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" hidden><span>Subir logo</span></label><button class="wt-ghost" type="button" data-wt-skip>No tengo, YAPI te hace uno</button>`;
    case 'photos': return `<label class="wt-drop" data-wt-dropzone><input type="file" name="photos" accept="image/png,image/jpeg,image/webp" multiple hidden><span>Arrastra tus fotos o toca para elegir</span></label><div class="wt-thumbs">${(values.photos || []).map(url => `<img src="${escapeHtml(url)}" alt="">`).join('')}</div>`;
    case 'products': return `<div class="wt-products">${[0, 1, 2, 3, 4].map(i => `<div class="wt-product"><input name="p${i}-name" placeholder="Producto" value="${v(`p${i}-name`)}"><input name="p${i}-price" inputmode="decimal" placeholder="Bs 45" value="${v(`p${i}-price`)}"></div>`).join('')}</div><p class="wt-aside"><button class="link" type="button" data-open-shopify-import>Tengo muchos: importar desde Shopify o CSV</button> · <button class="link" type="button" data-wt-skip>Los agrego después</button></p>`;
    case 'story': return `<textarea class="wt-input" name="story" maxlength="1200" rows="5" placeholder="Desde cuándo, dónde y qué hace único a tu negocio">${v('story')}</textarea>`;
    case 'contact': return `<input class="wt-input" name="whatsapp" inputmode="tel" placeholder="WhatsApp: +591 70000000" value="${v('whatsapp')}"><input class="wt-input" name="city" placeholder="Ciudad" value="${v('city')}">`;
    default: return '';
  }
};

export function walkthroughView(state) {
  const step = WALKTHROUGH_STEPS[state.step];
  const total = WALKTHROUGH_STEPS.length;
  return `<form class="wt" data-wt-form novalidate>
    <div class="wt-progress" role="progressbar" aria-label="Progreso" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${state.step + 1}"><i style="width:${Math.round(((state.step + 1) / total) * 100)}%"></i></div>
    <h1 class="wt-title">${escapeHtml(step.title)}</h1>${field(step, state.values)}
    ${state.error ? `<p class="wt-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    <footer class="wt-actions">${state.step ? '<button class="wt-ghost" type="button" data-wt-back>Atrás</button>' : '<span></span>'}<span>${step.optional ? '<button class="wt-ghost" type="button" data-wt-skip>Saltar</button>' : ''}<button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.step === total - 1 ? 'Crear mi tienda' : 'Siguiente'}</button></span></footer>
  </form>`;
}

export async function runWalkthrough(root, { api, uploadFile, onDone }) {
  // A second run on the same root must not stack listeners on the first.
  root._wtAbort?.abort();
  const abort = new AbortController();
  root._wtAbort = abort;
  const listen = (type, handler) => root.addEventListener(type, handler, { signal: abort.signal });

  const resume = await api('/stores/onboarding').catch(() => ({ store: null }));
  const saved = resume.store?.onboarding;
  let state = { ...{ step: 0, values: {}, storeId: null, busy: false, error: null },
    ...(resume.store ? { storeId: resume.store.id, step: Math.min(LAST, saved?.step ?? 1), values: { name: resume.store.name, what: saved?.what, story: saved?.story, photos: saved?.photos, whatsapp: saved?.contact?.whatsapp, city: saved?.contact?.city } } : {}) };
  const paint = () => { root.innerHTML = walkthroughView(state); root.querySelector('[autofocus]')?.focus(); };
  const patch = body => api(`/stores/${state.storeId}/onboarding`, { method: 'PATCH', body: JSON.stringify(body) });
  // Per run: product rows already created (index -> id), and the one chat-job id, so retries never duplicate.
  const created = {};
  const requestId = crypto.randomUUID();
  let brief = null;
  let jobPosted = false;
  const pickedFiles = name => [...(root.querySelector(`input[name="${name}"]`)?.files || [])];

  // `picked` is read before the busy repaint, which replaces the file inputs.
  async function save(skipped, picked) {
    const id = WALKTHROUGH_STEPS[state.step].id;
    const mark = { step: state.step + 1, ...(skipped ? { skipped: [id] } : { done: [id] }) };
    if (id === 'name' && !state.storeId) {
      const store = await api('/stores', { method: 'POST', body: JSON.stringify({ name: state.values.name.trim() }) });
      state = { ...state, storeId: store.id };
      return patch(mark);
    }
    if (skipped) return patch(mark);
    if (id === 'what') return patch({ ...mark, what: state.values.what });
    if (id === 'logo' && picked.logo[0]) await api(`/stores/${state.storeId}`, { method: 'PATCH', body: JSON.stringify({ logoUrl: await uploadFile(picked.logo[0]) }) });
    if (id === 'photos') {
      const urls = [...(state.values.photos || []), ...await Promise.all(picked.photos.slice(0, 20).map(file => uploadFile(file)))].slice(0, 20);
      state = { ...state, values: { ...state.values, photos: urls } };
      return patch({ ...mark, photos: urls });
    }
    if (id === 'products') {
      for (let i = 0; i < 5; i++) {
        const [draft] = created[i] ? [] : productDrafts([{ name: state.values[`p${i}-name`], price: state.values[`p${i}-price`] }]);
        if (!draft) continue;
        const product = await api(`/stores/${state.storeId}/payment_links`, { method: 'POST', body: JSON.stringify({ ...draft, currency: 'BOB' }) });
        created[i] = product?.id || true;
      }
    }
    if (id === 'story') return patch({ ...mark, story: state.values.story });
    if (id === 'contact') {
      // Order matters: the job exists before the store is marked finished, so a reload never strands a finished store.
      if (!jobPosted) {
        brief = (await patch({ ...mark, contact: { whatsapp: state.values.whatsapp, city: state.values.city }, brief: true }))?.brief;
        await api(`/stores/${state.storeId}/source-project/chat-jobs`, { method: 'POST', body: JSON.stringify({ instruction: brief || `Mi negocio se llama ${state.values.name}.\nCrea mi tienda.`, assetUrls: state.values.photos || [], revision: 0, setupAction: 'generate', requestId }) });
        jobPosted = true;
      }
      return patch({ step: WALKTHROUGH_STEPS.length, finished: true });
    }
    return patch(mark);
  }

  async function advance(skipped) {
    const moved = skipped ? nextState(state, { type: 'skip' }) : nextState(state, { type: 'next' });
    if (moved.error) { state = moved; return paint(); }
    const picked = { logo: pickedFiles('logo'), photos: pickedFiles('photos') };
    state = { ...state, busy: true, error: null }; paint();
    try {
      const last = state.step === LAST;
      await save(skipped, picked);
      if (last) return onDone(state.storeId);
      state = { ...moved, storeId: state.storeId, values: state.values, busy: false };
    } catch (error) {
      state = { ...state, busy: false, error: `No pudimos guardar este paso (${error?.message || 'error'}). Inténtalo de nuevo${WALKTHROUGH_STEPS[state.step].optional ? ' o sáltalo' : ''}.` };
    }
    paint();
  }

  listen('input', event => { if (event.target.name && event.target.type !== 'file') { delete created[/^p(\d)-/.exec(event.target.name)?.[1]]; state = nextState(state, { type: 'field', name: event.target.name, value: event.target.value }); } });
  listen('submit', event => { event.preventDefault(); if (!state.busy) void advance(false); });
  listen('click', event => {
    if (event.target.closest('[data-wt-skip]') && !state.busy) void advance(true);
    if (event.target.closest('[data-wt-back]') && !state.busy) { state = nextState(state, { type: 'back' }); paint(); }
  });
  paint();
}
