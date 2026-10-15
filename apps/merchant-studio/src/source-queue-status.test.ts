import { describe, expect, it } from 'vitest';
import { queueStatus } from './source-queue-status';

describe('queueStatus (2026-10-15: a waiting request looked frozen)', () => {
  it('names the running store of the same merchant, and how many wait first', () => {
    expect(queueStatus({ status: 'QUEUED', queue: { ahead: 1, runningStore: 'Raíz Viva' } })).toBe('En espera: YAPI termina primero un pedido en Raíz Viva. Tu pedido empieza solo, no hace falta reenviarlo.');
    expect(queueStatus({ status: 'QUEUED', queue: { ahead: 3 } })).toBe('En espera: YAPI termina primero 3 pedidos. Tu pedido empieza solo, no hace falta reenviarlo.');
  });
  it('says nothing once the request runs or when nothing is ahead', () => {
    expect(queueStatus({ status: 'RUNNING', queue: { ahead: 1 } })).toBeNull();
    expect(queueStatus({ status: 'QUEUED', queue: { ahead: 0 } })).toBeNull();
    expect(queueStatus({ status: 'QUEUED' })).toBeNull();
  });
});
