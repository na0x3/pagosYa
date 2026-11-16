import { withStoreMenu } from './v2-menus';
import type { SaveSourceProjectDto } from '../dto/save-source-project.dto';
import type { SourceProjectSnapshot } from '../source-project';
import { assembleV2Files, type V2Context, type V2File } from './v2-context';
import { v2ContractProblems } from './v2-prompts';
import type { SandboxBuild } from './v2-sandbox';

/** V2 prototype build loop (docs/superpowers/specs/2026-11-14-v2-prototype-design.md §3–5): write, repair what has one right answer
 *  in code, check the V2 contract, assemble over the base store, build in the sandbox, check the commerce contract, then look at the
 *  rendered page — and on any problem hand the writer its own files back with the reasons, at most `attempts` times. The best
 *  version that built is kept (fewest visual problems), so a later attempt that fails never loses a good build. Side effects are
 *  injected. */

/** Findings a store is saved with rather than fixed again (each fix round costs a full writer call). */
const MINOR = /La misma foto aparece dos veces|usa otra letra/;

/** Free mode's blocking page checks (owner 2026-11-14, like Amboras's advisory checks): what is broken, not what is a matter of
 *  taste — sideways scroll, text over text or cut in half, unreadable text, a band of only words or only a photo, a squeezed phone
 *  title, a photo twice. */
export const FREE_BLOCKERS = new Set(['h-overflow', 'overlapping-text', 'broken-words', 'low-contrast', 'text-only-band', 'dark-text-band', 'dark-colour-text-band', 'photo-only-band', 'phone-squeezed-title', 'repeated-photo', 'cropped-words']);
/** Advice for templates, breakage for a written home (owner 2026-11-14 «meathouse is all messed up»): a decorative word over the
 *  title, big words a photo covers, words cut off by their box. */
export const FREE_ADVICE_BLOCKERS = new Set(['decor-over-text', 'covered-text', 'clipped-text', 'empty-section', 'weak-hero', 'huge-photo', 'pale-page']);
// Each line names its block of <main> («[sección N] ») so a fix can rewrite only that section (v2-section-fix).
export const freeBlocking = (findings: readonly { rule: string; severity: string; line: string; part?: number | null }[]) =>
  findings.filter(finding => (finding.severity === 'block' && FREE_BLOCKERS.has(finding.rule)) || FREE_ADVICE_BLOCKERS.has(finding.rule))
    .map(finding => `${typeof finding.part === 'number' ? `[sección ${finding.part}] ` : ''}${finding.line.replace(/^(BLOQUEA|CONSEJO):\s*/, '')}`);

export type V2Attempt = { attempt: number; ms: number; outcome: 'built' | 'visual' | 'contract' | 'build' | 'commerce' | 'no-answer'; problems: string[]; repairs?: string[] };
export type V2BuildDeps = {
  write: (feedback: string[], previous?: V2File[]) => Promise<V2File[] | null>;
  /** Deterministic fixes applied to every answer before any check. */
  repair?: (files: V2File[]) => { files: V2File[]; repairs: string[] };
  build: (input: SaveSourceProjectDto) => Promise<SandboxBuild>;
  commerce: (snapshot: SourceProjectSnapshot) => string | null;
  /** Blocking problems seen on the rendered pages (desktop and phone); [] when clean. */
  inspect?: (snapshot: SourceProjectSnapshot) => Promise<string[]>;
  /** Owner 2026-11-15 (like Amboras's bot screenshotting its page): the model looks at screenshots of what it built — once the rules
   *  are clean, or on the last attempt — and names what looks wrong, as check lines. Each look that finds something earns one more
   *  fix round of its own (at most `looks`, default 2), so the rule rounds are not spent on it. */
  look?: (snapshot: SourceProjectSnapshot, attempt: number) => Promise<string[]>;
  looks?: number;
  /** Each attempt as soon as it ends (live 2026-11-14: the reasons only appeared after all three). */
  onAttempt?: (attempt: V2Attempt) => void;
  attempts?: number;
  signal?: AbortSignal;
};
type Built = { files: V2File[]; input: SaveSourceProjectDto; snapshot: SourceProjectSnapshot; visual: string[] };
export type V2BuildResult = ({ ok: true; attempts: V2Attempt[] } & Built) | { ok: false; attempts: V2Attempt[] };

export async function runV2Build(base: { revision: number; brief: SaveSourceProjectDto['brief']; files: SaveSourceProjectDto['files'] }, context: V2Context, label: string, deps: V2BuildDeps): Promise<V2BuildResult> {
  const attempts: V2Attempt[] = [];
  let max = deps.attempts ?? 4;
  let looksLeft = deps.look ? deps.looks ?? 2 : 0;
  // The version a look's problems went back for: it replaces the best one unless the rules find more breakage in it.
  let fromLook = false;
  let feedback: string[] = [];
  let previous: V2File[] | undefined;
  let best: Built | null = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    if (deps.signal?.aborted) throw new Error('El pedido se canceló.');
    const started = Date.now();
    // Owner 2026-11-14 (Gramiyaa: the ChatGPT limit ran out in the fix round after a version had built): a stop (a spent quota, a
    // cancel) after a version built keeps that version instead of losing it.
    let written: V2File[] | null;
    try { written = await deps.write(feedback, previous); } catch (error) {
      if (!best) throw error;
      attempts.push({ attempt, ms: Date.now() - started, outcome: 'no-answer', problems: [`Se detuvo: ${String((error as Error)?.message ?? error).slice(0, 200)}. Se guarda la mejor versión que compiló.`] });
      deps.onAttempt?.(attempts[attempts.length - 1]);
      break;
    }
    let repairs: string[] = [];
    const done = (outcome: V2Attempt['outcome'], problems: string[]) => {
      const entry: V2Attempt = { attempt, ms: Date.now() - started, outcome, problems, ...(repairs.length ? { repairs } : {}) };
      // An empty answer keeps the problems the version before it had, so the next fix still knows what to fix.
      attempts.push(entry); if (outcome !== 'no-answer' || !previous) feedback = problems; deps.onAttempt?.(entry);
    };
    if (!written) { done('no-answer', ['La respuesta no traía los archivos completos.']); continue; }
    const repaired = deps.repair ? deps.repair(written) : { files: written, repairs: [] };
    const files = repaired.files; repairs = repaired.repairs;
    previous = files;
    const contract = v2ContractProblems(files, context);
    if (contract.length) { done('contract', contract); continue; }
    const input = { revision: base.revision, label, brief: base.brief, files: withContextMenu(assembleV2Files(base.files, files, context.ownCards, context.ownIcons, context.cartSheet), context) } as SaveSourceProjectDto;
    const built = await deps.build(input);
    if (!built.ok) { done('build', [`${built.kind === 'build' ? 'No compiló' : built.kind === 'timeout' ? 'La compilación tardó demasiado' : 'La compilación se cayó'}: ${built.error.slice(0, 1500)}`]); continue; }
    const refused = deps.commerce(built.snapshot);
    if (refused) { done('commerce', [`El contrato de comercio lo rechaza: ${refused}`]); continue; }
    const visual = deps.inspect ? await deps.inspect(built.snapshot).catch(() => [] as string[]) : [];
    if (!best || visual.length < best.visual.length || (fromLook && visual.length <= best.visual.length)) best = { files, input, snapshot: built.snapshot, visual };
    fromLook = false;
    // A clean page, only small things left, or no attempt left: the best version that built is the answer. Owner 2026-11-14 («half
    // of the limit for 2 stores»): a repeated photo or one title in another letter is not worth another full fix round.
    const settled = !visual.length || visual.every(line => MINOR.test(line));
    if ((settled || attempt === max) && looksLeft > 0) {
      looksLeft--;
      const seen = await deps.look!(built.snapshot, attempt).catch(() => [] as string[]);
      if (seen.length) {
        if (attempt === max) max++;
        fromLook = true;
        done('visual', [...visual, ...seen]);
        continue;
      }
    }
    if (settled || attempt === max) { done('built', visual); break; }
    done('visual', visual);
  }
  return best ? { ok: true, attempts, ...best } : { ok: false, attempts };
}

/** The store's menu, as the direction chose it, written into config.js (spec 2026-11-15 store menu models). */
export function withContextMenu<T extends { path: string; content: string }>(files: T[], context: Pick<V2Context, 'menu'>): T[] {
  return context.menu ? withStoreMenu(files, context.menu) : files;
}
