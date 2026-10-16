import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import type { SourceInputImage } from '../source-generation-types';
import { storeTokens } from '../store-controls-design';
import { readConfigFile } from '../store-look';
import { COMMERCE_TEMPLATES_FILE, composeTemplatesFile, validateSurfaceTemplate, type SurfacePart, type SurfaceTemplate } from './surface-parts';
import type { SurfaceCheckResult, SurfaceFailure } from './surface-checks';
import { parseSurfacesAnswer, surfacesPrompt, type SurfacesCall } from './surface-design';

/** Spec 2026-10-15 free commerce surfaces: design → static check → real purchase → repair (≤2) → each failing part falls back alone. */
export type SurfacePartResult = { part: SurfacePart; status: 'passed' | 'repaired' | 'fallback'; failed?: string };
export type SurfacesOutcome = { file?: string; report: SurfacePartResult[]; note: string; retry: Array<{ label: string; value: string }>; failed?: string };
export const SURFACES_ALL_NOTE = 'Diseñé también tu carrito, tarjetas de producto, página de producto y pago.';
export const SURFACES_FAILED_NOTE = 'Tu tienda está guardada. No pude terminar el diseño de carrito y pago; puedes pedírmelo de nuevo.';
const SUBJECT: Record<SurfacePart, [string, string]> = { card: ['Las tarjetas de producto no pasaron', 'usan'], productPage: ['La página de producto no pasó', 'usa'], cart: ['El carrito no pasó', 'usa'], cartLine: ['Las líneas del carrito no pasaron', 'usan'], added: ['El aviso al agregar no pasó', 'usa'], checkout: ['El pago no pasó', 'usa'] };
const THE: Record<SurfacePart, string> = { card: 'las tarjetas de producto', productPage: 'la página de producto', cart: 'el carrito', cartLine: 'las líneas del carrito', added: 'el aviso al agregar', checkout: 'el pago' };
export function surfacesFallbackNote(parts: SurfacePart[]): string {
  if (parts.length === 1) return `${SUBJECT[parts[0]][0]} la prueba de compra, así que ${SUBJECT[parts[0]][1]} el diseño estándar por ahora.`;
  const names = parts.map(p => THE[p]);
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)} no pasaron la prueba de compra, así que usan el diseño estándar por ahora.`.replace(/^./, c => c.toUpperCase());
}
export const SURFACE_RETRY_LABEL = (part: SurfacePart) => `Reintentar ${THE[part]}`;
export const SURFACE_RETRY_INSTRUCTION = (part: SurfacePart) => `Rediseña ${THE[part]} de mi tienda.`;
const REPAIR_ROUNDS = 2;

export async function runCommerceSurfaces(deps: {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; kind: string; cartWord?: string; parts: SurfacePart[]; keep?: SurfaceTemplate[]; instruction?: string; signal: AbortSignal;
  call: SurfacesCall; check: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SurfaceCheckResult>; capture: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SourceInputImage[]>;
}): Promise<SurfacesOutcome> {
  const keep = (deps.keep ?? []).filter(t => !deps.parts.includes(t.part));
  const passed = new Map<SurfacePart, { t: SurfaceTemplate; repaired: boolean }>();
  const lastFailure = new Map<SurfacePart, string>();
  const billed: Array<() => void> = [];
  let pending: SurfacePart[] = [...deps.parts];
  let repair: { previous: SurfaceTemplate[]; failures: SurfaceFailure[] } | undefined;
  try {
    const images = await deps.capture(deps.files, deps.signal);
    const dna = (readConfigFile(deps.files).dna as Record<string, unknown> | undefined) ?? {};
    for (let round = 0; round <= REPAIR_ROUNDS && pending.length; round++) {
      deps.signal.throwIfAborted();
      const approved = [...keep, ...[...passed.values()].map(p => p.t)];
      const text = surfacesPrompt({ storeName: deps.storeName, kind: deps.kind, cartWord: deps.cartWord, tokens: storeTokens(deps.files), dna, parts: pending, keep: approved, ...(repair ? { repair } : {}), ...(deps.instruction ? { instruction: deps.instruction } : {}) });
      const { body, used } = await deps.call(text, images);
      billed.push(used);
      const answered = parseSurfacesAnswer(body, pending) ?? [];
      const failures: SurfaceFailure[] = pending.filter(p => !answered.some(t => t.part === p)).map(part => ({ part, check: 'missing', detail: 'No llegó la plantilla.' }));
      const candidates = answered.filter(t => {
        const reasons = validateSurfaceTemplate(t);
        if (reasons.length) failures.push({ part: t.part, check: 'static', detail: reasons.join(' ') });
        return !reasons.length;
      });
      if (candidates.length) {
        const file = composeTemplatesFile([...approved, ...candidates]);
        const result = await deps.check([...deps.files.filter(f => f.path !== COMMERCE_TEMPLATES_FILE), { path: COMMERCE_TEMPLATES_FILE, content: file }], deps.signal);
        failures.push(...result.failures.filter(f => candidates.some(t => t.part === f.part)));
        for (const t of candidates) if (!failures.some(f => f.part === t.part)) passed.set(t.part, { t, repaired: round > 0 });
      }
      for (const f of failures) lastFailure.set(f.part, f.check);
      pending = pending.filter(p => !passed.has(p));
      repair = { previous: answered.filter(t => pending.includes(t.part)), failures: failures.filter(f => pending.includes(f.part)) };
    }
  } catch (error) {
    // A cancelled run (the merchant's «Cancelar pedido») propagates; only other errors become "the stage failed".
    deps.signal.throwIfAborted();
    return { report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: ((error as Error)?.message || 'error').slice(0, 300) };
  }
  if (passed.size) for (const used of billed) used();
  const report: SurfacePartResult[] = deps.parts.map(part => passed.has(part)
    ? { part, status: passed.get(part)!.repaired ? 'repaired' : 'passed' }
    : { part, status: 'fallback', failed: lastFailure.get(part) ?? 'missing' });
  const fallback = report.filter(r => r.status === 'fallback').map(r => r.part);
  const kept = [...keep, ...deps.parts.filter(p => passed.has(p)).map(p => passed.get(p)!.t)];
  return {
    ...(kept.length ? { file: composeTemplatesFile(kept) } : {}),
    report,
    note: fallback.length ? surfacesFallbackNote(fallback) : SURFACES_ALL_NOTE,
    retry: fallback.map(part => ({ label: SURFACE_RETRY_LABEL(part), value: SURFACE_RETRY_INSTRUCTION(part) })),
  };
}
