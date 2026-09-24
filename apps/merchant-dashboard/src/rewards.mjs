// Presentation for server-drawn rewards. The API decides every prize; this module only animates it.
export const WHEEL_VISUALS = {
  STICKER_COMMON: { label: "Sticker", icon: "🎁", color: "#ffc956" },
  XP_25: { label: "+25 XP", icon: "⭐", color: "#7fd3c3" },
  AI_CREDITS_5: { label: "5 IA", icon: "🪄", color: "#b9b4ff" },
  TIP: { label: "Consejo", icon: "💡", color: "#fff5bd" },
  XP_50: { label: "+50 XP", icon: "🌟", color: "#9be2a8" },
  RESPIN: { label: "+1 giro", icon: "🔁", color: "#f27a62" },
  STICKER_RARE: { label: "Raro", icon: "✨", color: "#15352f", ink: "#fff5bd" },
  XP_200: { label: "+200 XP", icon: "🏆", color: "#ff9f43" },
  AI_CREDITS_25: { label: "25 IA", icon: "💎", color: "#3b2a8f", ink: "#fff5bd" },
};

export function wheelRotationFor(currentRotation, segmentIndex, segmentCount, { turns = 6, jitter = 0 } = {}) {
  const slice = 360 / segmentCount;
  const center = segmentIndex * slice + slice / 2;
  const target = (((360 - center + jitter) % 360) + 360) % 360;
  return currentRotation - (currentRotation % 360) + 360 * turns + target;
}

const RING_SIDE = 7;
export function boardTileCoords(index) {
  const edge = RING_SIDE - 1;
  const ring = edge * 4;
  const i = ((index % ring) + ring) % ring;
  if (i < edge) return { row: 1, col: 1 + i };
  if (i < edge * 2) return { row: 1 + (i - edge), col: RING_SIDE };
  if (i < edge * 3) return { row: RING_SIDE, col: RING_SIDE - (i - edge * 2) };
  return { row: RING_SIDE - (i - edge * 3), col: 1 };
}

export function boardHopPath(from, die, tiles = 24) {
  return Array.from({ length: die }, (_, step) => (from + step + 1) % tiles);
}

export function xpAnimationSegments(previousXp, gainedXp, thresholds) {
  const levelOf = (xp) => thresholds.reduce((level, threshold, index) => (xp >= threshold ? index : level), 0);
  const pct = (xp, level) => {
    const ceiling = thresholds[level + 1];
    return ceiling === undefined ? 100 : Math.round(((xp - thresholds[level]) / (ceiling - thresholds[level])) * 100);
  };
  const target = previousXp + gainedXp;
  const segments = [];
  let level = levelOf(previousXp);
  let fromPct = pct(previousXp, level);
  while (level < levelOf(target)) {
    segments.push({ level, fromPct, toPct: 100 });
    level += 1; fromPct = 0;
  }
  segments.push({ level, fromPct, toPct: pct(target, level) });
  return segments;
}

export function rewardCopy(grant) {
  const n = (value) => Number(value).toLocaleString("es-BO");
  const icon = WHEEL_VISUALS[grant.prize]?.icon;
  if (grant.convertedFrom === "AI_CREDITS") return { icon: "🏆", title: `¡+${n(grant.amount)} XP!`, message: " Llegaste al tope de créditos de IA de este mes, así que te lo dimos en XP." };
  if (grant.kind === "XP") return { icon: icon || "⭐", title: `¡+${n(grant.amount)} XP!`, message: " Tu barra de progreso acaba de subir." };
  if (grant.kind === "AI_CREDITS") return { icon: icon || "🪄", title: `¡${n(grant.amount)} créditos de IA!`, message: " YAPI los usará primero en tu próximo diseño." };
  if (grant.kind === "STICKER") return { icon: grant.sticker.icon, title: grant.sticker.isNew ? `¡Sticker nuevo: ${grant.sticker.name}!` : `${grant.sticker.name}, otra vez`, message: grant.sticker.isNew ? " Ya está pegado en tu álbum." : " Ya lo tenías: ¡tu colección sigue brillando!" };
  if (grant.kind === "RESPIN") return { icon: "🔁", title: "¡Otra vuelta!", message: " La suerte te da un giro extra. ¡Dale!" };
  const mission = grant.tip?.kind === "mission";
  return { icon: mission ? "🧭" : "💡", title: mission ? "Misión del día" : "Un consejo para vender más", message: ` ${grant.tip?.text || ""}` };
}

const SEGMENT_MS = 900;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// Some bars scale via --xp-progress-scale, others (topbar, Horizonte) via an inline scaleX on their fill span; drive both.
function setBar(track, pct) {
  const scale = Math.round(pct) / 100;
  track.style.setProperty("--xp-progress-scale", String(scale));
  const fill = track.querySelector(":scope > span:not(.xp-gain-float)");
  if (fill) fill.style.transform = `scaleX(${scale})`;
  track.setAttribute("aria-valuenow", String(Math.round(pct)));
}

function restartClass(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function tween(duration, onStep, frame, now) {
  return new Promise((resolve) => {
    const start = now();
    const step = () => {
      const t = Math.min(1, (now() - start) / duration);
      onStep(easeOut(t));
      if (t < 1) frame(step); else resolve();
    };
    frame(step);
  });
}

/** Fills every visible XP bar from the old value to the new one, with a sheen, a counting label and a pulse at the end. */
export async function celebrateXpGain({ previousXp, gainedXp, thresholds, bars, announcer, reduceMotion = false, onLevelUp, playSound, frame = (cb) => requestAnimationFrame(cb), now = () => performance.now() }) {
  if (!(gainedXp > 0) || !bars.length) return;
  const segments = xpAnimationSegments(previousXp, gainedXp, thresholds);
  const target = previousXp + gainedXp;
  const label = (xp) => bars.forEach((bar) => { if (bar.label) bar.label.textContent = bar.format ? bar.format(Math.round(xp)) : `${Math.round(xp).toLocaleString("es-BO")} XP`; });
  if (announcer) announcer.textContent = `Ganaste ${gainedXp.toLocaleString("es-BO")} XP`;
  bars.forEach(({ track }) => {
    const float = document.createElement("span");
    float.className = "xp-gain-float"; float.setAttribute("aria-hidden", "true");
    float.textContent = `+${gainedXp.toLocaleString("es-BO")} XP`;
    track.appendChild(float);
    setTimeout(() => float.remove(), reduceMotion ? 2000 : 1400);
  });
  if (reduceMotion) {
    bars.forEach(({ track }) => setBar(track, segments[segments.length - 1].toPct));
    label(target);
    segments.slice(1).forEach((segment) => onLevelUp?.(segment.level));
    return;
  }
  playSound?.();
  bars.forEach(({ track }) => track.classList.add("is-xp-gaining"));
  const xpPerSegment = gainedXp / segments.length;
  for (const [index, segment] of segments.entries()) {
    if (index > 0) { bars.forEach(({ track }) => restartClass(track, "is-xp-flash")); onLevelUp?.(segment.level); }
    await tween(SEGMENT_MS, (p) => {
      bars.forEach(({ track }) => setBar(track, segment.fromPct + (segment.toPct - segment.fromPct) * p));
      label(previousXp + xpPerSegment * (index + p));
    }, frame, now);
  }
  label(target);
  bars.forEach(({ track }) => { track.classList.remove("is-xp-gaining"); restartClass(track, "is-xp-pulse"); });
}
