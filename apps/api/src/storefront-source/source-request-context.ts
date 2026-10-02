import type { SourceProgress } from './source-progress';
import type { SourceMerchantRequest } from './source-merchant-request';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

/** Carries the durable request's cancellation and commit fence through all chat branches. */
export const sourceRequestContext = new AsyncLocalStorage<{
  signal: AbortSignal;
  jobId: string;
  request: SourceMerchantRequest;
  progress?: (progress: SourceProgress) => Promise<void>;
  assertLease: (tx: Prisma.TransactionClient, revision: number, storeId: string) => Promise<void>;
}>();
