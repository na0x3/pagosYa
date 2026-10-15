// First-store walkthrough (spec 2026-10-11 Elige tu estilo, C1): one question per screen; the store exists from step 1.
import { escapeHtml } from './html.mjs';

export const WALKTHROUGH_STEPS = [
  { id: 'name', title: '¿Cómo se llama tu negocio?', optional: false },
  { id: 'what', title: '¿Qué vendes o a qué te dedicas?', optional: false },
  { id: 'sell', title: '¿Vas a vender en línea?', optional: false },
  { id: 'logo', title: '¿Tienes logo?', optional: true },
  { id: 'photos', title: 'Sube fotos de tu negocio', optional: true },
  { id: 'products', title: 'Agrega hasta 5 productos', optional: true },
  { id: 'story', title: 'Unas preguntas sobre tu negocio', optional: true },
  { id: 'contact', title: '¿Cómo te contactan?', optional: true },
];
const REQUIRED = { name: 'Escribe el nombre de tu negocio.', what: 'Cuéntanos en una frase qué vendes.' };
const LAST = WALKTHROUGH_STEPS.length - 1;

// A showcase (spec 2026-10-13) shows a business instead of selling online. These words in «¿Qué vendes o a qué te dedicas?»
// pre-select «No, solo mostrar mi negocio»: a local guess, never a model call, and the merchant confirms it on the next screen.
const SHOWCASE_WORDS = [/\barquitect/, /\bconsultor/, /\bclinica/, /\babogad/, /\bfotograf/, /\bestudio de\b/, /\bdiseno de interiores\b/, /\bservicios profesionales\b/, /\bodontolog/, /\bdentist/, /\bpsicolog/, /\bcontador/, /\bnotari/, /\basesor/, /\bagencia de\b/];
export function guessSitePurpose(what) {
  const text = String(what || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return SHOWCASE_WORDS.some(word => word.test(text)) ? 'showcase' : 'shop';
}

// What «¿Qué hace el botón principal?» saves. WhatsApp uses the number field above it; with nothing chosen, WhatsApp when a
// number is given, otherwise the contact form.
export function mainAction(values) {
  const digits = String(values.whatsapp || '').replace(/\D/g, '');
  const kind = values.action || (digits.length >= 7 ? 'whatsapp' : 'form');
  if (kind === 'whatsapp') return { kind, value: String(values.whatsapp || '').trim() };
  if (kind === 'booking') return { kind, value: String(values.booking || '').trim() };
  if (kind === 'phone') return { kind, value: String(values.phone || '').trim() };
  return { kind: 'form' };
}

function actionProblem(step, values) {
  if (step.id !== 'contact' || values.sell !== 'showcase') return null;
  const action = mainAction(values);
  const digits = String(action.value || '').replace(/\D/g, '').length;
  if (action.kind === 'whatsapp' && digits < 7) return 'Escribe tu número de WhatsApp o elige otro botón.';
  if (action.kind === 'phone' && digits < 7) return 'Escribe el número al que te llaman.';
  if (action.kind === 'booking' && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(action.value)) return 'Escribe el enlace de reservas completo, empezando con https://';
  return null;
}

// «Agrega hasta 5 productos» is passed over, both ways, once the merchant said they will not sell online.
const move = (from, by, values) => {
  let to = Math.min(LAST, Math.max(0, from + by));
  if (WALKTHROUGH_STEPS[to].id === 'products' && values.sell === 'showcase') to = Math.min(LAST, Math.max(0, to + by));
  return to;
};

export function nextState(state, action) {
  const step = WALKTHROUGH_STEPS[state.step];
  if (action.type === 'field') return { ...state, error: null, values: { ...state.values, [action.name]: action.value } };
  if (action.type === 'back') return { ...state, error: null, step: move(state.step, -1, state.values) };
  if (action.type === 'skip') return step.optional ? { ...state, error: null, step: move(state.step, 1, state.values) } : state;
  if (action.type === 'next') {
    // The sell screen arrives answered with the guess; Siguiente without touching it keeps the guess.
    const values = step.id === 'sell' && !state.values.sell ? { ...state.values, sell: guessSitePurpose(state.values.what) } : state.values;
    if (!step.optional && !String(values[step.id] || '').trim()) return { ...state, error: REQUIRED[step.id] };
    const problem = actionProblem(step, values);
    if (problem) return { ...state, error: problem };
    return { ...state, values, error: null, step: move(state.step, 1, values) };
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

// Spec 2026-10-14 store voice: the story step asks two or three questions chosen by the kind of business (the API sends them
// with the «¿Qué vendes?» save). Every answer is optional and travels word for word, up to 400 characters.
export function answersFor(questions, values) {
  return (questions || []).map((question, index) => ({ question, answer: String(values[`a${index}`] || '').trim().slice(0, 400) })).filter(entry => entry.answer);
}
export function answerValues(questions, answers) {
  const values = {};
  (questions || []).forEach((question, index) => { const saved = (answers || []).find(entry => entry?.question === question); if (saved?.answer) values[`a${index}`] = saved.answer; });
  return values;
}

// Files chosen or dropped but not uploaded yet: shown at once, kept in state so an error repaint never loses them.
const pendingView = files => (files || []).map(({ file, url }) => `<figure class="wt-pending">${url ? `<img src="${escapeHtml(url)}" alt="">` : ''}<figcaption>${escapeHtml(file.name || '')}</figcaption></figure>`).join('');

const field = (step, values, pending = {}, questions = []) => {
  const v = name => escapeHtml(String(values[name] || ''));
  switch (step.id) {
    case 'name': return `<input class="wt-input" name="name" maxlength="120" autocomplete="organization" placeholder="Café Buna" value="${v('name')}" autofocus><p class="wt-aside">¿Vienes de Shopify? <button class="link" type="button" data-open-shopify-import>Trae tu tienda</button></p>`;
    case 'what': return `<textarea class="wt-input" name="what" maxlength="300" rows="3" placeholder="Café de especialidad tostado en Sopocachi" autofocus>${v('what')}</textarea>`;
    case 'logo': return `<label class="wt-drop"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" hidden><span>Arrastra tu logo o toca para elegir</span></label><div class="wt-thumbs">${pendingView(pending.logo)}</div><button class="wt-ghost" type="button" data-wt-skip>No tengo, YAPI te hace uno</button>`;
    case 'photos': return `<label class="wt-drop" data-wt-dropzone><input type="file" name="photos" accept="image/png,image/jpeg,image/webp" multiple hidden><span>Arrastra tus fotos o toca para elegir</span></label><div class="wt-thumbs">${(values.photos || []).map(url => `<img src="${escapeHtml(url)}" alt="">`).join('')}${pendingView(pending.photos)}</div>`;
    case 'products': return `<div class="wt-products">${[0, 1, 2, 3, 4].map(i => `<div class="wt-product"><input name="p${i}-name" placeholder="Producto" value="${v(`p${i}-name`)}"><input name="p${i}-price" inputmode="decimal" placeholder="Bs 45" value="${v(`p${i}-price`)}"></div>`).join('')}</div><p class="wt-aside"><button class="link" type="button" data-open-shopify-import>Tengo muchos: importar desde Shopify o CSV</button> · <button class="link" type="button" data-wt-skip>Los agrego después</button></p>`;
    case 'story': {
      // An older API sends no questions: the free story box stays.
      if (!questions.length) return `<textarea class="wt-input" name="story" maxlength="1200" rows="5" placeholder="Desde cuándo, dónde y qué hace único a tu negocio">${v('story')}</textarea>`;
      return `<p class="wt-aside">Responde las que quieras: YAPI escribe tu tienda con tus palabras.</p>${questions.slice(0, 3).map((question, index) => `<label class="wt-question"><span>${escapeHtml(question)}</span><textarea class="wt-input" name="a${index}" maxlength="400" rows="2">${v(`a${index}`)}</textarea></label>`).join('')}`;
    }
    case 'sell': {
      const chosen = values.sell || guessSitePurpose(values.what);
      const option = (value, label) => `<label class="wt-choice"><input type="radio" name="sell" value="${value}" ${chosen === value ? 'checked' : ''}> ${label}</label>`;
      return `<div class="wt-choices" role="radiogroup" aria-label="¿Vas a vender en línea?">${option('shop', 'Sí, quiero vender')}${option('showcase', 'No, solo mostrar mi negocio')}</div><p class="wt-aside">Sin ventas en línea tu sitio no tiene carrito ni productos: muestra tu negocio y lleva a tus clientes a contactarte.</p>`;
    }
    case 'contact': {
      const base = `<input class="wt-input" name="whatsapp" inputmode="tel" placeholder="WhatsApp: +591 70000000" value="${v('whatsapp')}"><input class="wt-input" name="city" placeholder="Ciudad" value="${v('city')}">`;
      if (values.sell !== 'showcase') return base;
      const chosen = mainAction(values).kind;
      const option = (kind, label) => `<label class="wt-choice"><input type="radio" name="action" value="${kind}" ${chosen === kind ? 'checked' : ''}> ${label}</label>`;
      return `${base}<fieldset class="wt-choices"><legend>¿Qué hace el botón principal?</legend>${option('whatsapp', 'WhatsApp')}${option('form', 'Formulario de contacto')}${option('booking', 'Enlace de reservas')}${option('phone', 'Llamada')}</fieldset>${chosen === 'booking' ? `<input class="wt-input" name="booking" inputmode="url" placeholder="https://tu-agenda.com/tu-negocio" value="${v('booking')}">` : ''}${chosen === 'phone' ? `<input class="wt-input" name="phone" inputmode="tel" placeholder="Teléfono: +591 2 2000000" value="${v('phone')}">` : ''}`;
    }
    default: return '';
  }
};

// What the dashboard does with the walkthrough: boot opens it for a merchant with no stores or an unfinished one; "create" always starts fresh.
export function walkthroughEntry({ enabled, storeCount = 0, resumable = false, intent = 'boot' }) {
  if (!enabled) return intent === 'create' ? 'modal' : 'none';
  if (intent === 'create') return 'fresh';
  if (resumable) return 'resume';
  return storeCount === 0 ? 'fresh' : 'none';
}

// A store listed with unfinished walkthrough progress (null onboarding = made before the walkthrough, never unfinished).
export const isUnfinishedStore = (store, enabled = true) => enabled && store?.status !== 'ARCHIVED' && Boolean(store?.onboarding) && !store.onboarding.finishedAt;

// "Crear otra tienda" while a walkthrough store sits half-built: continue it or start a new one.
export function walkthroughChoiceView(store) {
  const name = escapeHtml(store?.name || '');
  return `<div class="wt" data-wt-choice>
    <button class="wt-ghost wt-exit" type="button" data-wt-exit>Salir</button>
    <h1 class="wt-title">Tienes una tienda sin terminar</h1>
    <p class="wt-aside">«${name}» quedó a medio crear.</p>
    <footer class="wt-actions"><button class="wt-ghost" type="button" data-wt-fresh>Empezar una nueva</button><button class="primary" type="button" data-wt-continue>Continuar con «${name}»</button></footer>
  </div>`;
}

export function showWalkthroughChoice(root, { store, onContinue, onFresh, onExit }) {
  root._wtAbort?.abort();
  const abort = new AbortController();
  root._wtAbort = abort;
  root.innerHTML = walkthroughChoiceView(store);
  root.addEventListener('click', event => {
    if (event.target.closest('[data-wt-continue]')) onContinue(store);
    else if (event.target.closest('[data-wt-fresh]')) onFresh();
    else if (event.target.closest('[data-wt-exit]')) onExit?.();
  }, { signal: abort.signal });
}

export function walkthroughView(state) {
  const step = WALKTHROUGH_STEPS[state.step];
  const total = WALKTHROUGH_STEPS.length;
  return `<form class="wt" data-wt-form novalidate>
    <div class="wt-progress" role="progressbar" aria-label="Progreso" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${state.step + 1}"><i style="width:${Math.round(((state.step + 1) / total) * 100)}%"></i></div>
    <button class="wt-ghost wt-exit" type="button" data-wt-exit>Salir</button>
    <h1 class="wt-title">${escapeHtml(step.title)}</h1>${field(step, state.values, state.pending, state.questions || [])}
    ${state.error ? `<p class="wt-error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    <footer class="wt-actions">${state.step ? '<button class="wt-ghost" type="button" data-wt-back>Atrás</button>' : '<span></span>'}<span>${step.optional ? '<button class="wt-ghost" type="button" data-wt-skip>Saltar</button>' : ''}<button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.step === total - 1 ? 'Crear mi tienda' : 'Siguiente'}</button></span></footer>
  </form>`;
}

export async function runWalkthrough(root, { api, uploadFile, onDone, onExit, resume: resumeStore }) {
  // A second run on the same root must not stack listeners on the first.
  root._wtAbort?.abort();
  const abort = new AbortController();
  root._wtAbort = abort;
  const listen = (type, handler) => root.addEventListener(type, handler, { signal: abort.signal });

  // `resume` given (a store, or null for a fresh run) skips the lookup; omitted keeps the old fetch.
  const resume = resumeStore !== undefined ? { store: resumeStore } : await api('/stores/onboarding').catch(() => ({ store: null }));
  const saved = resume.store?.onboarding;
  const resumedQuestions = Array.isArray(resume.store?.questions) ? resume.store.questions : [];
  let state = { ...{ step: 0, values: {}, storeId: null, busy: false, error: null, pending: { logo: [], photos: [] }, questions: [] },
    ...(resume.store ? { storeId: resume.store.id, step: Math.min(LAST, saved?.step ?? 1), questions: resumedQuestions, values: { name: resume.store.name, what: saved?.what, story: saved?.story, ...answerValues(resumedQuestions, saved?.answers), photos: saved?.photos, whatsapp: saved?.contact?.whatsapp, city: saved?.contact?.city, sell: saved?.purpose, action: saved?.primaryAction?.kind, booking: saved?.primaryAction?.kind === 'booking' ? saved.primaryAction.value : undefined, phone: saved?.primaryAction?.kind === 'phone' ? saved.primaryAction.value : undefined } } : {}) };
  const paint = () => { root.innerHTML = walkthroughView(state); root.querySelector('[autofocus]')?.focus(); };
  const patch = body => api(`/stores/${state.storeId}/onboarding`, { method: 'PATCH', body: JSON.stringify(body) });
  // Per run: product rows already created (index -> { id, name, amount }), and the one chat-job id, so retries never duplicate.
  const created = {};
  // Answers the merchant typed or picked in this run: a resumed run never overwrites saved ones with blanks.
  const touched = new Set();
  const requestId = crypto.randomUUID();
  let brief = null;
  let jobPosted = false;
  const MAX_PHOTOS = 20;
  const objectUrl = file => { try { return URL.createObjectURL(file); } catch { return ''; } };
  const isImage = file => /^image\//.test(file?.type || '');
  // Picked or dropped files wait in state until their step saves.
  function choose(name, files) {
    const images = [...(files || [])].filter(isImage);
    if (!images.length) return;
    const room = name === 'logo' ? 1 : MAX_PHOTOS - (state.values.photos || []).length;
    const kept = name === 'logo' ? images.slice(0, 1) : [...state.pending.photos.map(p => p.file), ...images].slice(0, Math.max(0, room));
    const previous = new Map(state.pending[name].map(p => [p.file, p.url]));
    for (const [file, url] of previous) if (url && !kept.includes(file)) URL.revokeObjectURL(url);
    state = { ...state, pending: { ...state.pending, [name]: kept.map(file => ({ file, url: previous.get(file) ?? objectUrl(file) })) } };
    paint();
  }
  function clearPending(name) {
    for (const { url } of state.pending[name]) if (url) URL.revokeObjectURL(url);
    state = { ...state, pending: { ...state.pending, [name]: [] } };
  }

  // `next` is the step the merchant lands on, which passes over products for a showcase.
  async function save(skipped, picked, next) {
    const id = WALKTHROUGH_STEPS[state.step].id;
    const mark = { step: next, ...(skipped ? { skipped: [id] } : { done: [id] }) };
    if (id === 'name' && !state.storeId) {
      const store = await api('/stores', { method: 'POST', body: JSON.stringify({ name: state.values.name.trim() }) });
      state = { ...state, storeId: store.id };
      return patch(mark);
    }
    if (skipped) return patch(mark);
    if (id === 'what') {
      const answered = await patch({ ...mark, what: state.values.what });
      if (Array.isArray(answered?.questions)) state = { ...state, questions: answered.questions };
      return answered;
    }
    if (id === 'sell') return patch({ ...mark, purpose: state.values.sell });
    if (id === 'logo' && picked.logo[0]) { await api(`/stores/${state.storeId}`, { method: 'PATCH', body: JSON.stringify({ logoUrl: await uploadFile(picked.logo[0]) }) }); clearPending('logo'); }
    if (id === 'photos') {
      const urls = [...(state.values.photos || []), ...await Promise.all(picked.photos.slice(0, MAX_PHOTOS).map(file => uploadFile(file)))].slice(0, MAX_PHOTOS);
      state = { ...state, values: { ...state.values, photos: urls } };
      clearPending('photos');
      return patch({ ...mark, ...(picked.photos.length ? { photos: urls } : {}) });
    }
    if (id === 'products') {
      for (let i = 0; i < 5; i++) {
        const [draft] = productDrafts([{ name: state.values[`p${i}-name`], price: state.values[`p${i}-price`] }]);
        if (!draft) continue;
        const made = created[i];
        // An edited row updates the product it created; a second POST would leave the old price in the brief.
        if (made) {
          if (made.id && (made.name !== draft.name || made.amount !== draft.amount)) await api(`/stores/${state.storeId}/payment_links/${made.id}`, { method: 'PATCH', body: JSON.stringify({ name: draft.name, amount: draft.amount }) });
          created[i] = { ...made, name: draft.name, amount: draft.amount };
          continue;
        }
        const product = await api(`/stores/${state.storeId}/payment_links`, { method: 'POST', body: JSON.stringify({ ...draft, currency: 'BOB' }) });
        created[i] = { id: product?.id, name: draft.name, amount: draft.amount };
      }
    }
    if (id === 'story') return patch({ ...mark, ...(state.questions?.length ? { answers: answersFor(state.questions, state.values) } : { story: state.values.story }) });
    if (id === 'contact') {
      // Order matters: the job exists before the store is marked finished, so a reload never strands a finished store.
      if (!jobPosted) {
        // A showcase (spec 2026-10-13) saves its main action and builds as a service site: no products, no cart.
        const showcase = state.values.sell === 'showcase';
        brief = (await patch({ ...mark, ...(touched.has('whatsapp') || touched.has('city') ? { contact: { whatsapp: state.values.whatsapp, city: state.values.city } } : {}), ...(showcase ? { primaryAction: mainAction(state.values) } : {}), brief: true }))?.brief;
        await api(`/stores/${state.storeId}/source-project/chat-jobs`, { method: 'POST', body: JSON.stringify({ instruction: brief || `Mi negocio se llama ${state.values.name}.\nCrea mi tienda.`, assetUrls: state.values.photos || [], revision: 0, setupAction: 'generate', requestId, ...(showcase ? { sitePurpose: 'service' } : {}) }) });
        jobPosted = true;
      }
      return patch({ step: WALKTHROUGH_STEPS.length, finished: true });
    }
    return patch(mark);
  }

  async function advance(skipped) {
    const moved = skipped ? nextState(state, { type: 'skip' }) : nextState(state, { type: 'next' });
    if (moved.error) { state = moved; return paint(); }
    const picked = { logo: state.pending.logo.map(p => p.file), photos: state.pending.photos.map(p => p.file) };
    // The sell screen's guess becomes the answer here, so the step saves what the merchant saw.
    state = { ...state, values: moved.values, busy: true, error: null }; paint();
    try {
      const last = state.step === LAST;
      await save(skipped, picked, moved.step);
      if (last) return onDone(state.storeId);
      state = { ...moved, storeId: state.storeId, values: state.values, pending: state.pending, questions: state.questions, busy: false };
    } catch (error) {
      state = { ...state, busy: false, error: `No pudimos guardar este paso (${error?.message || 'error'}). Inténtalo de nuevo${WALKTHROUGH_STEPS[state.step].optional ? ' o sáltalo' : ''}.` };
    }
    paint();
  }

  // Choosing the main button repaints, so the booking link or phone field it needs appears.
  listen('input', event => { if (event.target.name && event.target.type !== 'file') { touched.add(event.target.name); state = nextState(state, { type: 'field', name: event.target.name, value: event.target.value }); if (event.target.name === 'action') paint(); } });
  listen('change', event => { if (event.target.type === 'file' && ['logo', 'photos'].includes(event.target.name)) choose(event.target.name, event.target.files); });
  // A file dropped anywhere on the overlay must never navigate the browser away; only the logo and photos steps take it.
  listen('dragover', event => event.preventDefault());
  listen('drop', event => {
    event.preventDefault();
    const id = WALKTHROUGH_STEPS[state.step].id;
    if (!state.busy && (id === 'logo' || id === 'photos')) choose(id, event.dataTransfer?.files);
  });
  listen('submit', event => { event.preventDefault(); if (!state.busy) void advance(false); });
  listen('click', event => {
    if (event.target.closest('[data-wt-exit]') && !state.busy) { onExit?.(); return; }
    if (event.target.closest('[data-wt-skip]') && !state.busy) void advance(true);
    if (event.target.closest('[data-wt-back]') && !state.busy) { state = nextState(state, { type: 'back' }); paint(); }
  });
  paint();
}
