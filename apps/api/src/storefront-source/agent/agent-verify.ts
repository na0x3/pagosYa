import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import { compileNextPreview, nextSourceFile, repairNextAuthoredMarkup, repairNextCommerceMounts, repairNextMisdirectedImports, repairNextSharedComponentReferences, validateNextSources } from '../source-next';
import { validateSourceArtwork, validateSourceEditScope } from '../source-edit-scope';
import type { SourceSitePurpose } from '../source-site-purpose';

export type AgentFinding = { source: 'typescript' | 'contract' | 'scope' | 'artwork' | 'runtime' | 'theme'; message: string };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * The validators that used to fail a paid attempt, as data the agent fixes in its next steps. The code-only repairs
 * (imports, commerce mounts, alt text) run first, exactly as generate() runs them after a model response.
 */
export async function verifyAgentDraft(input: { previous: SourceProjectFileDto[]; draft: SourceProjectFileDto[]; instruction: string; purpose: SourceSitePurpose; sectionScope?: Parameters<typeof validateSourceEditScope>[3]; motifPaths?: string[] }) {
  const repairs: string[] = [];
  let files = repairNextSharedComponentReferences(input.draft);
  for (const repair of [repairNextMisdirectedImports, (f: SourceProjectFileDto[]) => repairNextCommerceMounts(f, input.purpose), repairNextAuthoredMarkup]) {
    const result = repair(files);
    files = result.files;
    repairs.push(...result.repairs);
  }
  const findings: AgentFinding[] = [];
  const authored = files.filter(f => nextSourceFile(f.path));
  try { validateNextSources(authored, input.purpose); } catch (error) { findings.push({ source: 'contract', message: message(error) }); }
  // compileNextPreview runs the TypeScript diagnostics (an undefined component, a wrong prop type); validateNextSources does not.
  try { await compileNextPreview(authored, input.purpose); } catch (error) { findings.push({ source: 'typescript', message: message(error) }); }
  if (input.previous.length) {
    try { validateSourceEditScope(input.previous, files, input.instruction, input.sectionScope); } catch (error) { findings.push({ source: 'scope', message: message(error) }); }
  }
  try { validateSourceArtwork(input.previous, files, input.instruction, input.motifPaths); } catch (error) { findings.push({ source: 'artwork', message: message(error) }); }
  findings.push(...authoredAccountPhotos(input.previous, files), ...authoredAccountHooks(input.previous, files));
  return { files, findings, repairs };
}

/**
 * set_account_theme draws the whole sign-in and sign-up page, its split photo included. An auth component that adds its
 * own photo beside AccountGatePage shows the picture twice and squeezes the form into a strip (PEPPA please 2026-10-20).
 * Only files this edit changed: an older store is never blocked on a re-save.
 */
export function authoredAccountPhotos(previous: SourceProjectFileDto[], files: SourceProjectFileDto[]): AgentFinding[] {
  const before = new Map(previous.map(f => [f.path, f.content]));
  return files
    .filter(f => /^components\/auth\/[^/]+\.tsx$/.test(f.path) && before.get(f.path) !== f.content && /<(img|picture|figure|video)\b|<Image\b|background(-image)?\s*:\s*url\(/i.test(f.content))
    .map(f => ({ source: 'contract' as const, message: `${f.path} pone una foto propia junto al formulario de cuenta: la plataforma ya dibuja la página entera y la foto se muestra dos veces. Quita la foto y cualquier columna o rejilla alrededor de AccountGatePage, y pon la foto con set_account_theme (layout split, photo assets/…).` }));
}

/**
 * An auth component that marks the document or body to style the account form from the store's CSS goes around
 * set_account_theme and its checks (PEPPA please 2026-10-20). Only files this edit changed.
 */
export function authoredAccountHooks(previous: SourceProjectFileDto[], files: SourceProjectFileDto[]): AgentFinding[] {
  const before = new Map(previous.map(f => [f.path, f.content]));
  return files
    .filter(f => /^components\/auth\/[^/]+\.tsx$/.test(f.path) && before.get(f.path) !== f.content && /document\.(?:documentElement|body)\.(?:classList|className|setAttribute|dataset)/.test(f.content))
    .map(f => ({ source: 'contract' as const, message: `${f.path} marca el documento para cambiar el formulario de cuenta desde el CSS de la tienda. Quita ese código y usa set_account_theme; para una sola página, empieza el selector con [data-account-gate="register"].` }));
}
