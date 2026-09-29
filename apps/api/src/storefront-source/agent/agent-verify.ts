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
  return { files, findings, repairs };
}
