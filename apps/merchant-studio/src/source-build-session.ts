export type SourceBuildSession =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'running'; jobId: string; requestId: string }
  | { phase: 'completed' }
  | { phase: 'interrupted' };
export type SourceBuildEvent =
  | { type: 'submit' }
  | { type: 'accepted'; jobId: string; requestId: string }
  | { type: 'complete' }
  | { type: 'interrupt' }
  | { type: 'reset' };
export const buildIsActive = (state: SourceBuildSession) => state.phase === 'submitting' || state.phase === 'running';
export function sourceBuildTransition(state: SourceBuildSession, event: SourceBuildEvent): SourceBuildSession {
  switch (event.type) {
    case 'submit': return buildIsActive(state) ? state : { phase: 'submitting' };
    case 'accepted': return { phase: 'running', jobId: event.jobId, requestId: event.requestId };
    case 'complete': return { phase: 'completed' };
    case 'interrupt': return { phase: 'interrupted' };
    case 'reset': return { phase: 'idle' };
  }
}
