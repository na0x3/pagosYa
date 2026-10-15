import type { SourceChatJob } from './api';

/** The chat line while a request waits behind another one: the API runs one YAPI request at a time. */
export function queueStatus(job: Pick<SourceChatJob, 'status' | 'queue'>): string | null {
  if (job.status !== 'QUEUED' || !job.queue?.ahead) return null;
  const { ahead, runningStore } = job.queue;
  const what = ahead === 1 ? 'un pedido' : `${ahead} pedidos`;
  return `En espera: YAPI termina primero ${what}${runningStore && ahead === 1 ? ` en ${runningStore}` : ''}. Tu pedido empieza solo, no hace falta reenviarlo.`;
}
