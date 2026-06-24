import { AsyncLocalStorage } from 'async_hooks';

export interface TraceStore {
  traceId: string;
  jobId?: string;
  projectId?: string;
  userId?: string;
}

export const traceLocalStorage = new AsyncLocalStorage<TraceStore>();
