import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import type { SourceInputImage } from '../source-generation-types';
import { storeTokens } from '../store-controls-design';
import { readConfigFile } from '../store-look';
import { COMMERCE_TEMPLATES_FILE, composeTemplatesFile, validateSurfaceTemplate, type SurfacePart, type SurfaceTemplate } from './surface-parts';
import type { SurfaceCheckResult, SurfaceFailure } from './surface-checks';
import { parseSurfacesAnswer, surfacesPrompt, type SurfacesCall } from './surface-design';

/** Spec 2026-10-15 free commerce surfaces: design → static check → real purchase → repair (≤2) → each failing part falls back alone. */
export type SurfacePartResult = { part: SurfacePart; status: 'passed' | 'repaired' | 'fallback'; failed?: string };
/** `rounds`: every round's failures, kept with the generation's attempts so a fallback can be explained afterwards. */
export type SurfacesOutcome = { file?: string; report: SurfacePartResult[]; note: string; retry: Array<{ label: string; value: string }>; failed?: string; rounds?: Array<{ round: number; failures: SurfaceFailure[] }> };
export const SURFACES_ALL_NOTE = 'Diseñé también tu carrito, tarjetas de producto, página de producto y pago.';
export const SURFACES_FAILED_NOTE = 'Tu tienda está guardada. No pude terminar el diseño de carrito y pago; puedes pedírmelo de nuevo.';
const SUBJECT: Record<SurfacePart, [string, string]> = { card: ['Las tarjetas de producto no pasaron', 'usan'], productPage: ['La página de producto no pasó', 'usa'], cart: ['El carrito no pasó', 'usa'], cartLine: ['Las líneas del carrito no pasaron', 'usan'], added: ['El aviso al agregar no pasó', 'usa'], checkout: ['El pago no pasó', 'usa'] };
const THE: Record<SurfacePart, string> = { card: 'las tarjetas de producto', productPage: 'la página de producto', cart: 'el carrito', cartLine: 'las líneas del carrito', added: 'el aviso al agregar', checkout: 'el pago' };
const joinParts = (parts: SurfacePart[]) => { const names = parts.map(p => THE[p]); return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]; };
const capital = (text: string) => text.replace(/^./, c => c.toUpperCase());
const plural = (parts: SurfacePart[]) => parts.length > 1 || SUBJECT[parts[0]][1] === 'usan';
/** What the chat says (review I5, I10): what passed on a request, what went back to the standard design, what stayed as it was. */
export function surfacesNote(input: { passed: SurfacePart[]; standard: SurfacePart[]; kept: SurfacePart[]; request: boolean }): string {
  const lines: string[] = [];
  if (!input.standard.length && !input.kept.length) return input.request ? `Rediseñé ${joinParts(input.passed)}.` : SURFACES_ALL_NOTE;
  if (input.request && input.passed.length) lines.push(`Rediseñé ${joinParts(input.passed)}.`);
  if (input.standard.length) lines.push(input.standard.length === 1
    ? `${SUBJECT[input.standard[0]][0]} la prueba de compra, así que ${SUBJECT[input.standard[0]][1]} el diseño estándar por ahora.`
    : `${capital(joinParts(input.standard))} no pasaron la prueba de compra, así que usan el diseño estándar por ahora.`);
  if (input.kept.length) lines.push(input.kept.length === 1
    ? `${SUBJECT[input.kept[0]][0]} la prueba de compra, así que ${plural(input.kept) ? 'se quedan como estaban' : 'se queda como estaba'}.`
    : `${capital(joinParts(input.kept))} no pasaron la prueba de compra, así que se quedan como estaban.`);
  return lines.join(' ');
}
export const SURFACE_RETRY_LABEL = (part: SurfacePart) => `Reintentar ${THE[part]}`;
export const SURFACE_RETRY_INSTRUCTION = (part: SurfacePart) => `Rediseña ${THE[part]} de mi tienda.`;
const REPAIR_ROUNDS = 2;

export async function runCommerceSurfaces(deps: {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; kind: string; cartWord?: string; parts: SurfacePart[]; keep?: SurfaceTemplate[]; instruction?: string; signal: AbortSignal;
  /** The run's own signal: only its abort (the merchant cancelled) propagates. `signal` also carries the stage's deadline. */
  cancel?: AbortSignal;
  call: SurfacesCall; check: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SurfaceCheckResult>; capture: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SourceInputImage[]>;
}): Promise<SurfacesOutcome> {
  const keep = (deps.keep ?? []).filter(t => !deps.parts.includes(t.part));
  /** A requested part's current design: kept when its redesign fails (review I5). */
  const before = new Map((deps.keep ?? []).filter(t => deps.parts.includes(t.part)).map(t => [t.part, t]));
  const passed = new Map<SurfacePart, { t: SurfaceTemplate; repaired: boolean }>();
  /** Parts the purchase has not reached yet (an earlier step broke): carried to the next check, never frozen (review I4). */
  const untested = new Map<SurfacePart, SurfaceTemplate>();
  const designedIn = new Map<SurfacePart, number>();
  const lastFailure = new Map<SurfacePart, string>();
  const billed: Array<() => void> = [];
  const rounds: Array<{ round: number; failures: SurfaceFailure[] }> = [];
  let pending: SurfacePart[] = [...deps.parts];
  let repair: { previous: SurfaceTemplate[]; failures: SurfaceFailure[] } | undefined;
  const approved = () => [...keep, ...[...passed.values()].map(p => p.t)];
  const checkWith = (candidates: SurfaceTemplate[]) => deps.check([...deps.files.filter(f => f.path !== COMMERCE_TEMPLATES_FILE), { path: COMMERCE_TEMPLATES_FILE, content: composeTemplatesFile([...approved(), ...candidates]) }], deps.signal);
  /** Sorts each checked candidate into passed, failed or still untested. */
  const settle = (candidates: SurfaceTemplate[], result: SurfaceCheckResult, failures: SurfaceFailure[]) => {
    failures.push(...result.failures.filter(f => candidates.some(t => t.part === f.part)));
    for (const t of candidates) {
      if (failures.some(f => f.part === t.part)) continue;
      if (result.skipped === 'empty catalog' || result.reached.includes(t.part)) passed.set(t.part, { t, repaired: (designedIn.get(t.part) ?? 0) > 0 });
      else untested.set(t.part, t);
    }
  };
  try {
    const images = await deps.capture(deps.files, deps.signal);
    const dna = (readConfigFile(deps.files).dna as Record<string, unknown> | undefined) ?? {};
    for (let round = 0; round <= REPAIR_ROUNDS && pending.length; round++) {
      deps.signal.throwIfAborted();
      const text = surfacesPrompt({ storeName: deps.storeName, kind: deps.kind, cartWord: deps.cartWord, tokens: storeTokens(deps.files), dna, parts: pending, keep: approved(), ...(repair ? { repair } : {}), ...(deps.instruction ? { instruction: deps.instruction } : {}) });
      const { body, used } = await deps.call(text, images);
      billed.push(used);
      const answered = parseSurfacesAnswer(body, pending) ?? [];
      for (const t of answered) designedIn.set(t.part, round);
      const failures: SurfaceFailure[] = pending.filter(p => !answered.some(t => t.part === p)).map(part => ({ part, check: 'missing', detail: 'No llegó la plantilla.' }));
      const designed = answered.filter(t => {
        const reasons = validateSurfaceTemplate(t);
        if (reasons.length) failures.push({ part: t.part, check: 'static', detail: reasons.join(' ') });
        return !reasons.length;
      });
      const candidates = [...designed, ...untested.values()];
      untested.clear();
      if (candidates.length) settle(candidates, await checkWith(candidates), failures);
      rounds.push({ round, failures: failures.map(f => ({ ...f, detail: f.detail.slice(0, 300) })) });
      // A missing answer never hides the browser failure that made the part pending.
      for (const f of failures) if (f.check !== 'missing' || !lastFailure.has(f.part)) lastFailure.set(f.part, f.check);
      pending = deps.parts.filter(p => !passed.has(p) && !untested.has(p));
      repair = { previous: answered.filter(t => pending.includes(t.part)), failures: failures.filter(f => pending.includes(f.part)) };
    }
    // Parts never reached: one more purchase now that the failing parts fell back to the kit's (review I4).
    if (untested.size) {
      const candidates = [...untested.values()];
      untested.clear();
      const failures: SurfaceFailure[] = [];
      settle(candidates, await checkWith(candidates), failures);
      for (const f of failures) lastFailure.set(f.part, f.check);
      for (const part of untested.keys()) lastFailure.set(part, 'unreached');
      untested.clear();
    }
  } catch (error) {
    // A cancelled run (the merchant's «Cancelar pedido») propagates; the stage's own deadline and other errors become "the stage failed".
    (deps.cancel ?? deps.signal).throwIfAborted();
    return { report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: ((error as Error)?.message || 'error').slice(0, 300), ...(rounds.length ? { rounds } : {}) };
  }
  if (passed.size) for (const used of billed) used();
  const report: SurfacePartResult[] = deps.parts.map(part => passed.has(part)
    ? { part, status: passed.get(part)!.repaired ? 'repaired' : 'passed' }
    : { part, status: 'fallback', failed: lastFailure.get(part) ?? 'missing' });
  const fallback = report.filter(r => r.status === 'fallback').map(r => r.part);
  const kept = [...keep, ...deps.parts.flatMap(p => passed.has(p) ? [passed.get(p)!.t] : before.has(p) ? [before.get(p)!] : [])];
  return {
    ...(kept.length ? { file: composeTemplatesFile(kept) } : {}),
    report,
    rounds,
    note: surfacesNote({ passed: deps.parts.filter(p => passed.has(p)), standard: fallback.filter(p => !before.has(p)), kept: fallback.filter(p => before.has(p)), request: Boolean(deps.instruction) }),
    retry: fallback.map(part => ({ label: SURFACE_RETRY_LABEL(part), value: SURFACE_RETRY_INSTRUCTION(part) })),
  };
}
