import { escapeHtml as esc } from "./html.mjs";

/**
 * Ajustes › Correos › Contenido: what the merchant says in their emails. The announcement, the
 * hero photo, the promotion, the brand story, the store note and the recommendations are the
 * same in every email; a per-email switch turns a section off in one email only. Anything left
 * unset is built from the store's own facts. Facts (codes, discounts, prices) come from the
 * platform: the merchant picks a code, never types one.
 */
const CAPS = { announcement: 90, storyTitle: 60, storyText: 300, note: 200 };
const STORY_FIELDS = ["storyTitle", "storyText", "storyImage"];

export function mountEmailContent(container, deps) {
  if (!container) return { load: async () => {}, render() {}, reset() {}, settled: async () => {} };
  const fresh = () => ({ data: null, edits: {}, busy: false, message: "" });
  let state = fresh();
  let generation = 0;
  let pending = Promise.resolve();

  const url = (path) => `${deps.base()}/content${path}`;
  const content = () => state.data?.content ?? {};
  const defaults = () => state.data?.defaults ?? {};
  const shared = () => (state.data?.promos ?? []).filter(p => p.shared);
  const edited = (key) => Object.hasOwn(state.edits, key);
  const on = (item) => content().emails?.[deps.type()]?.[item] !== false;

  // What each field shows: the merchant's edit, else what is saved, else the default.
  const savedPromo = () => content().promo === undefined ? "auto" : content().promo.promoCodeId === null ? "none" : content().promo.promoCodeId;
  const savedStory = () => content().story && !content().story.off ? content().story : null;
  const announcement = () => edited("announcement") ? state.edits.announcement : content().announcement?.text ?? defaults().announcement ?? "";
  const hero = () => edited("heroImage") ? state.edits.heroImage : content().heroImage?.url ?? "";
  const promo = () => edited("promo") ? state.edits.promo : savedPromo();
  const story = () => ({
    title: edited("storyTitle") ? state.edits.storyTitle : savedStory()?.title ?? defaults().storyTitle ?? "",
    text: edited("storyText") ? state.edits.storyText : savedStory()?.text ?? defaults().storyText ?? "",
    imageUrl: edited("storyImage") ? state.edits.storyImage : savedStory()?.imageUrl ?? "",
  });
  const note = () => edited("note") ? state.edits.note : content().note?.text ?? defaults().note ?? "";
  const recommendations = () => edited("recommendations") ? state.edits.recommendations : content().recommendations?.on !== false;

  const restore = (item) => `Editado por ti · <button type="button" class="link" data-content-restore="${item}">restaurar</button>`;
  const switchBox = (item) => `<label class="email-content-switch"><input type="checkbox" data-content-switch="${item}" ${on(item) ? "checked" : ""} ${state.busy ? "disabled" : ""}> en este correo</label>`;
  const count = (key, value) => `<span data-content-count="${key}">${value.length}</span>/${CAPS[key]}`;
  const photos = (attr, current, autoLabel) => `<div class="email-content-photos" role="group">
    <button type="button" ${attr}="" aria-pressed="${current === ""}">${esc(autoLabel)}</button>
    ${(state.data?.photos ?? []).map(p => `<button type="button" ${attr}="${esc(p.url)}" aria-pressed="${current === p.url}" title="${esc(p.label)}"><img src="${esc(deps.assetUrl(p.url))}" alt="${esc(p.label)}" width="56" height="56"></button>`).join("")}
  </div>`;

  function promoOptions() {
    const codes = shared();
    const value = promo();
    const option = (key, label) => `<option value="${esc(key)}"${key === value ? " selected" : ""}>${esc(label)}</option>`;
    const options = [
      option("auto", codes[0] ? `Automática — ${codes[0].code} · ${codes[0].discount}` : "Automática"),
      option("none", "Ninguna"),
      ...codes.map(c => option(c.id, `${c.code} · ${c.discount}`)),
    ];
    // A picked code that was since switched off or deactivated is not sent; say so rather than pretend it is automatic.
    if (!["auto", "none"].includes(value) && !codes.some(c => c.id === value)) options.push(option(value, "Código que ya no se comparte (no se envía)"));
    return options.join("");
  }

  function render() {
    if (!state.data || state.data.available === false) { container.innerHTML = ""; return; }
    const c = content();
    const s = story();
    const off = state.busy ? "disabled" : "";
    const storyOff = Boolean(c.story?.off);
    container.innerHTML = `<section class="email-content" aria-labelledby="email-content-title">
      <h4 id="email-content-title">Contenido de tus correos</h4>
      <p class="faint">Se usa en todos tus correos. Lo que no completes se arma con los datos de tu tienda. Puedes usar {cliente} y {tienda}.</p>

      <div class="email-content-row" data-content-row="announcement"><span class="email-content-label">Anuncio</span>
        <div><input data-content-announcement maxlength="${CAPS.announcement}" value="${esc(announcement())}" ${off}>
        <small>${count("announcement", announcement())}${c.announcement?.text !== undefined ? ` · ${restore("announcement")}` : ""}${c.announcement?.off ? ` · Apagado · <button type="button" class="link" data-content-restore="announcement">restaurar</button>` : ""}</small></div>
        ${switchBox("announcement")}</div>

      <div class="email-content-row" data-content-row="heroImage"><span class="email-content-label">Foto principal</span>
        <div>${photos("data-content-hero", hero(), "Automática")}<small>Automática usa la foto principal de tu sitio.</small></div></div>

      <div class="email-content-row" data-content-row="promo"><span class="email-content-label">Promoción</span>
        <div><select data-content-promo ${off}>${promoOptions()}</select>
        ${shared().length ? "" : '<small>Marca códigos con «Mostrar en correos» en Descuentos para ofrecerlos aquí.</small>'}</div>
        ${switchBox("promo")}</div>

      <div class="email-content-row" data-content-row="story"><span class="email-content-label">Mensaje de marca</span>
        ${storyOff
          ? `<div><small>El mensaje de marca no aparece en tus correos. <button type="button" class="link" data-content-restore="story">restaurar</button></small></div>`
          : `<div class="email-content-story">
              <label>Título <input data-content-story-title maxlength="${CAPS.storyTitle}" value="${esc(s.title)}" ${off}><small>${count("storyTitle", s.title)}</small></label>
              <label>Texto <textarea data-content-story-text maxlength="${CAPS.storyText}" rows="3" ${off}>${esc(s.text)}</textarea><small>${count("storyText", s.text)}</small></label>
              ${photos("data-content-story-image", s.imageUrl, "Sin foto")}
              <small>${savedStory() ? `${restore("story")} · ` : ""}<button type="button" class="link" data-content-story-off ${off}>Quitar de mis correos</button></small>
            </div>`}
        ${storyOff ? "" : switchBox("story")}</div>

      <div class="email-content-row" data-content-row="note"><span class="email-content-label">Nota de la tienda</span>
        <div><textarea data-content-note maxlength="${CAPS.note}" rows="2" ${off}>${esc(note())}</textarea>
        <small>${count("note", note())} · Se usa cuando no hay reseñas publicadas.${c.note ? ` · ${restore("note")}` : ""}</small></div></div>

      <div class="email-content-row" data-content-row="recommendations"><span class="email-content-label">Recomendaciones</span>
        <label class="email-content-switch"><input type="checkbox" data-content-recommendations ${recommendations() ? "checked" : ""} ${off}> Mostrar productos recomendados</label>
        ${switchBox("recommendations")}</div>

      <p class="email-studio-status" role="status"${state.message ? "" : " hidden"}>${esc(state.message)}</p>
      <button type="button" data-content-save ${off}>Guardar contenido</button>
    </section>`;
    wire();
  }

  function wire() {
    const q = (selector) => container.querySelector(selector);
    const text = (selector, key) => q(selector)?.addEventListener("input", (event) => {
      state.edits[key] = event.target.value;
      const counter = container.querySelector(`[data-content-count="${key}"]`);
      if (counter) counter.textContent = String(event.target.value.length);
    });
    text("[data-content-announcement]", "announcement");
    text("[data-content-story-title]", "storyTitle");
    text("[data-content-story-text]", "storyText");
    text("[data-content-note]", "note");
    q("[data-content-promo]")?.addEventListener("change", (event) => { state.edits.promo = event.target.value; });
    q("[data-content-recommendations]")?.addEventListener("change", (event) => { state.edits.recommendations = event.target.checked; });
    // Photo choices re-render to show the pressed one; typed text lives in the edits, so nothing is lost.
    container.querySelectorAll("[data-content-hero]").forEach(b => b.addEventListener("click", () => { state.edits.heroImage = b.dataset.contentHero; render(); }));
    container.querySelectorAll("[data-content-story-image]").forEach(b => b.addEventListener("click", () => { state.edits.storyImage = b.dataset.contentStoryImage; render(); }));
    container.querySelectorAll("[data-content-switch]").forEach(box => box.addEventListener("change", () =>
      run(() => deps.api(url(`/emails/${encodeURIComponent(deps.type())}/${box.dataset.contentSwitch}`), { method: "PUT", body: JSON.stringify({ on: box.checked }) }), "Listo.", [])));
    container.querySelectorAll("[data-content-restore]").forEach(b => b.addEventListener("click", () => {
      const item = b.dataset.contentRestore;
      run(() => deps.api(url(`/${item}`), { method: "DELETE" }), "Restaurado.", item === "story" ? STORY_FIELDS : [item]);
    }));
    q("[data-content-story-off]")?.addEventListener("click", () =>
      run(() => deps.api(url("/story"), { method: "PUT", body: JSON.stringify({ off: true }) }), "El mensaje de marca ya no aparece en tus correos.", STORY_FIELDS));
    q("[data-content-save]")?.addEventListener("click", () => save());
  }

  /** The items whose value differs from what is saved, as the requests that save them. */
  function changes() {
    const c = content();
    const out = [];
    const put = (item, value) => () => deps.api(url(`/${item}`), { method: "PUT", body: JSON.stringify(value) });
    const del = (item) => () => deps.api(url(`/${item}`), { method: "DELETE" });
    if (edited("announcement") && state.edits.announcement !== (c.announcement?.text ?? defaults().announcement)) out.push(put("announcement", { text: state.edits.announcement }));
    if (edited("heroImage") && state.edits.heroImage !== (c.heroImage?.url ?? "")) out.push(state.edits.heroImage ? put("heroImage", { url: state.edits.heroImage }) : del("heroImage"));
    if (edited("promo") && state.edits.promo !== savedPromo()) {
      out.push(state.edits.promo === "auto" ? del("promo") : put("promo", { promoCodeId: state.edits.promo === "none" ? null : state.edits.promo }));
    }
    if (STORY_FIELDS.some(edited)) {
      const s = story();
      const before = savedStory() ?? { title: defaults().storyTitle, text: defaults().storyText, imageUrl: null };
      if (s.title !== before.title || s.text !== before.text || (s.imageUrl || null) !== (before.imageUrl || null)) out.push(put("story", { title: s.title, text: s.text, imageUrl: s.imageUrl || null }));
    }
    if (edited("note") && state.edits.note !== (c.note?.text ?? defaults().note)) out.push(put("note", { text: state.edits.note }));
    if (edited("recommendations") && state.edits.recommendations !== (c.recommendations?.on !== false)) out.push(put("recommendations", { on: state.edits.recommendations }));
    return out;
  }

  function save() {
    const requests = changes();
    if (!requests.length) { state = { ...state, message: "No hay cambios para guardar." }; render(); return; }
    run(async () => { for (const request of requests) await request(); }, "Contenido guardado.", Object.keys(state.edits));
  }

  /** One change at a time: on success its edits clear and the preview reloads; on failure what the merchant typed stays. */
  function run(action, done, clears) {
    state = { ...state, busy: true, message: "" };
    render();
    pending = (async () => {
      try {
        await action();
        for (const key of clears) delete state.edits[key];
        state = { ...state, busy: false, message: done };
        deps.onChange?.();
        await fetchContent();
      } catch (error) {
        state = { ...state, busy: false, message: error?.message || "No pudimos guardar el contenido." };
        render();
      }
    })();
    return pending;
  }

  async function fetchContent() {
    const mine = ++generation;
    let data = null;
    // A failed load hides the panel: the emails still send with the store's facts.
    try { data = await deps.api(url("")); } catch {}
    if (mine !== generation) return;
    state = { ...state, data };
    render();
  }

  return {
    load() { state = fresh(); pending = fetchContent(); return pending; },
    render,
    reset() { generation += 1; state = fresh(); container.innerHTML = ""; },
    settled: () => pending,
  };
}
