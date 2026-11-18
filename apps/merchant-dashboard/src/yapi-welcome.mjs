/**
 * YAPI's welcome (owner 2026-11-15): opening the panel lands on the site's cream wash with the YAPI star, the greeting and
 * one white box — «¿Qué quieres crear o mejorar?» (spec 2026-11-16, Clyro; the ASCII butterflies are retired). Writing
 * there opens YAPI with those words; «Ir a mi panel» (or Escape) goes on to Inicio. Once per visit, and never over a link
 * that asked for another screen.
 */

/** Only an entry with no screen asked for (or Inicio itself) gets the welcome; a link to Pedidos goes straight there. Owner
 * 2026-11-17 («i dont want to see it everytime i refresh»): once per visit — a refresh in the same tab goes straight to the panel.
 * @param {string} hash @param {boolean} [seen] the welcome already showed in this tab */
export function shouldWelcome(hash, seen = false) {
  return !seen && (!hash || hash === "#" || hash === "#dashboard-overview");
}

const SEEN_KEY = "pagosya_yapi_welcome_seen";
/** Whether this tab already showed the welcome (sessionStorage: survives a refresh, not a new tab). */
export function welcomeSeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; }
}
export function markWelcomeSeen() {
  try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode: it shows again next time */ }
}

/** The ASCII animals on a canvas; returns their disposer, or null when the engine can't start (no 2D canvas).
 * @param {HTMLCanvasElement} canvas @param {Record<string, unknown>} options */
export async function mountAsciiAnimals(canvas, options) {
  try {
    const { AnimalEngine } = await import("/src/ascii-animals.mjs");
    const engine = new AnimalEngine(canvas, options);
    return () => engine.destroy();
  } catch {
    return null;
  }
}

/**
 * @param {{ root: HTMLElement, greeting: string, onAsk: (text: string, from: DOMRect) => boolean | void, onClose?: () => void }} options
 * onAsk returns false when the words can't go to YAPI yet (no store): the welcome stays open with its note.
 */
/** «Mejorar mi marca» (spec 2026-11-18): what the chip sends — a branding request the API runs as the brand flow — with what was typed (a link, a few words). */
export function brandAsk(typed) {
  const words = String(typed ?? "").trim();
  return words ? `Mejorar mi marca. ${words}` : "Mejorar mi marca";
}

export function showYapiWelcome({ root, greeting, onAsk, onClose }) {
  const form = root.querySelector("form");
  const field = root.querySelector("textarea");
  const send = root.querySelector("[data-welcome-send]");
  const note = root.querySelector("[data-welcome-note]");
  root.querySelector("[data-welcome-greeting]").textContent = greeting;
  // Only Chromium runs an SVG filter inside backdrop-filter (the bending glass); the others get frosted glass.
  root.classList.toggle("yapi-welcome-liquid", /Chrome\//.test(navigator.userAgent));
  root.hidden = false;
  root.classList.remove("is-leaving");
  document.body.classList.add("yapi-welcome-open");

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("yapi-welcome-open");
    const done = () => { root.hidden = true; root.classList.remove("is-leaving"); onClose?.(); };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    root.classList.add("is-leaving");
    setTimeout(done, 420);
  };
  const onKey = (event) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) close(); };
  document.addEventListener("keydown", onKey);

  // The box grows with what is written, up to its max height, like the dock.
  const fit = () => { field.style.height = "auto"; field.style.height = `${field.scrollHeight}px`; send.disabled = !field.value.trim(); };
  field.addEventListener("input", fit);
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });
  root.querySelector("[data-welcome-brand]")?.addEventListener("click", () => {
    if (onAsk(brandAsk(field.value), form.getBoundingClientRect()) === false) return;
    note.textContent = "";
    field.value = "";
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = field.value.trim();
    if (!text) return;
    if (onAsk(text, form.getBoundingClientRect()) === false) return;
    note.textContent = "";
    field.value = "";
    fit();
    close();
  });
  root.querySelector("[data-welcome-skip]").addEventListener("click", close);
  fit();
  requestAnimationFrame(() => field.focus({ preventScroll: true }));
  return {
    close,
    greet: (text) => { root.querySelector("[data-welcome-greeting]").textContent = text; },
    note: (text) => { note.textContent = text; },
    /** The store mascots' bubbles under the greeting (src/store-mascots.mjs renderMascotBubbles). */
    summary: (html) => { root.querySelector("[data-welcome-mascots]").innerHTML = html; },
  };
}
