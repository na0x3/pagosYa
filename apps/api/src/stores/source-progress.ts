export const SOURCE_PROGRESS_LABELS = {
  interpreting: 'Interpretando tu pedido',
  assets: 'Preparando los recursos del sitio',
  design: 'Definiendo la composición',
  building: 'Construyendo los cambios',
  validating: 'Comprobando el código y los recursos',
  repairing: 'Corrigiendo los problemas detectados',
  saving: 'Guardando la nueva versión',
} as const;
export type SourceProgressStage = keyof typeof SOURCE_PROGRESS_LABELS;
export type SourceProgressReporter = (stage: SourceProgressStage) => Promise<void>;
export type SourceProgress = { status: 'running' | 'completed' | 'failed'; startedAt: number; updatedAt: number; steps: Array<{ stage: SourceProgressStage; label: string; startedAt: number; finishedAt?: number; status: 'running' | 'completed' | 'failed' }> };

/** Workflow milestones only. Never includes model reasoning, prompts or source code. */
export function createSourceProgress(persist: (progress: SourceProgress) => Promise<unknown>) {
  const value: SourceProgress = { status: 'running', startedAt: Date.now(), updatedAt: Date.now(), steps: [] };
  const save = async () => { value.updatedAt = Date.now(); await persist(structuredClone(value)).catch(() => {}); };
  const report: SourceProgressReporter = async stage => {
    if (value.status !== 'running') return;
    const last = value.steps.at(-1);
    if (last?.stage === stage) return;
    if (last) { last.status = stage === 'repairing' ? 'failed' : 'completed'; last.finishedAt = Date.now(); }
    value.steps.push({ stage, label: SOURCE_PROGRESS_LABELS[stage], startedAt: Date.now(), status: 'running' });
    await save();
  };
  const finish = async (status: 'completed' | 'failed') => {
    value.status = status;
    const last = value.steps.at(-1);
    if (last) { last.status = status; last.finishedAt = Date.now(); }
    await save();
  };
  return { value, report, finish };
}
