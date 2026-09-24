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
