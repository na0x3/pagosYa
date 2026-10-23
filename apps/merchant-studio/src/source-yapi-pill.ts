/** YAPI in design mode (spec 2026-10-22 v2 §2, §5): where the pill sits and whether its star turns. */
export type PillPlace = { x: number; y: number } | null;
export type Box = { width: number; height: number };
const KEY = 'pagosya_yapi_pill';
const EDGE = 8;
const BOTTOM = 24;
const PHONE = 600;
const STEP = 10;

export function loadPlace(storage: Pick<Storage, 'getItem'> | null): PillPlace {
  try {
    const raw = storage?.getItem(KEY);
    const value = raw ? JSON.parse(raw) : null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}

export function savePlace(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, place: PillPlace) {
  try { if (place) storage?.setItem(KEY, JSON.stringify(place)); else storage?.removeItem(KEY); } catch { /* private window: kept until reload */ }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function placePill(place: PillPlace, pill: Box, viewport: Box) {
  if (viewport.width <= PHONE) return { left: 0, top: viewport.height - pill.height, docked: true };
  const x = place?.x ?? (viewport.width - pill.width) / 2;
  const y = place?.y ?? viewport.height - pill.height - BOTTOM;
  return { left: Math.round(clamp(x, EDGE, viewport.width - pill.width - EDGE)), top: Math.round(clamp(y, EDGE, viewport.height - pill.height - EDGE)), docked: false };
}

export function nudge(place: PillPlace, key: string, pill: Box, viewport: Box): PillPlace {
  const move: Record<string, [number, number]> = { ArrowUp: [0, -STEP], ArrowDown: [0, STEP], ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0] };
  if (!move[key]) return place;
  const at = placePill(place, pill, viewport);
  return { x: at.left + move[key][0], y: at.top + move[key][1] };
}

export function spinState(input: { building: boolean; followingOwnRequest: boolean; reducedMotion: boolean }): 'spin' | 'pulse' | 'idle' {
  if (!input.building && !input.followingOwnRequest) return 'idle';
  return input.reducedMotion ? 'pulse' : 'spin';
}
