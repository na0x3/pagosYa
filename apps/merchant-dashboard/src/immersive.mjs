/**
 * The immersive move into Diseño (spec 2026-10-21 C2): when a merchant writes to YAPI, the page dissolves into the
 * design room (View Transitions where the browser has them) while a glass card carrying their words flies to where
 * YAPI's window opens. Reduced motion: the view simply changes. The card's text is set with textContent, never HTML.
 */

/** Where YAPI's glass window opens: bottom-right, 24px in (16px on a phone), as wide as the window. */
export function narratorTarget({ width, height }) {
  const gap = width <= 600 ? 16 : 24;
  const w = Math.min(380, width - 32);
  const h = 120;
  return { left: width - gap - w, top: height - gap - h, width: w, height: h };
}

/** Keyframes that carry a card from `from` to `to`, fading out as it lands. */
export function flightFrames(from, to) {
  const dx = to.left - from.left, dy = to.top - from.top;
  const sx = to.width / from.width, sy = to.height / from.height;
  const round = (n) => Math.round(n * 100) / 100;
  return [
    { transform: "translate(0px, 0px) scale(1, 1)", opacity: 1, offset: 0 },
    { transform: `translate(${round(dx * .6)}px, ${round(dy * .6)}px) scale(${round(1 + (sx - 1) * .6)}, ${round(1 + (sy - 1) * .6)})`, opacity: 1, offset: .6 },
    { transform: `translate(${round(dx)}px, ${round(dy)}px) scale(${round(sx)}, ${round(sy)})`, opacity: 0, offset: 1 },
  ];
}

/**
 * @param {{ doc: Document, from: { left: number, top: number, width: number, height: number }, text: string,
 *   go: () => void, reducedMotion?: boolean, duration?: number }} options
 */
export async function playImmersiveMove({ doc, from, text, go, reducedMotion, duration = 700 }) {
  const win = doc.defaultView;
  const reduced = reducedMotion ?? Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  if (reduced) { go(); return; }
  const ghost = doc.createElement("div");
  ghost.className = "yapi-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.textContent = text;
  Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  doc.body.append(ghost);
  const to = narratorTarget({ width: win?.innerWidth || 1440, height: win?.innerHeight || 900 });
  const flight = typeof ghost.animate === "function"
    ? ghost.animate(flightFrames(from, to), { duration, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" }).finished.catch(() => {})
    : new Promise((resolve) => win.setTimeout(resolve, duration));
  if (typeof doc.startViewTransition === "function") {
    try { doc.startViewTransition(() => go()); } catch { go(); }
  } else go();
  await flight;
  ghost.remove();
}
