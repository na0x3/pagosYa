/** A Boceto multi-selection: picks are a block (`path: ''`) or a part inside it. Shared by the panel, Capas and the menu. */
export type BocetoPick = { id: string; path: string };
export const PICK_MAX = 40;

export const samePick = (a: BocetoPick, b: BocetoPick) => a.id === b.id && a.path === b.path;
const inside = (inner: BocetoPick, outer: BocetoPick) => inner.id === outer.id && inner.path !== outer.path && (outer.path === '' || inner.path.startsWith(`${outer.path}/`));

/** Later picks win: a pick drops earlier picks inside it, replaces an earlier pick around it, and repeats move last. */
export function normalizePicks(picks: BocetoPick[]): BocetoPick[] {
  const out: BocetoPick[] = [];
  for (const pick of picks) {
    for (let i = out.length - 1; i >= 0; i--) if (samePick(out[i], pick) || inside(out[i], pick) || inside(pick, out[i])) out.splice(i, 1);
    out.push(pick);
  }
  return out.slice(-PICK_MAX);
}

export function togglePick(picks: BocetoPick[], pick: BocetoPick): BocetoPick[] {
  return picks.some(other => samePick(other, pick)) ? picks.filter(other => !samePick(other, pick)) : normalizePicks([...picks, pick]);
}
