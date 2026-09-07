import { Asset } from '@prisma/client';

export interface AdminMetricsData {
  totalStorageBytes: number;
  totalAssets: number;
  totalDownloads: number;
  activeWorkers: number;
}

export interface WorkerNodeDetail {
  id: string;
  status: 'ONLINE';
  ttlRemainingSeconds: number;
}

export interface LastCronJobDetail {
  timestamp: string;
  deletedCount: number;
  message: string;
  executedBy: string;
}

export interface QueueMetricsData {
  queueDepth: {
    pendingJobs: number;
    activeProcessingJobs: number;
  };
  dlq: {
    queueDepth: number;
  };
  failedAssetsCount: number;
  workers: {
    activeNodes: number;
    nodes: WorkerNodeDetail[];
  };
  locks: {
    activeJobLocks: number;
  };
  lastCronJob: LastCronJobDetail | null;
}

export interface DlqSyncResult {
  syncedCount: number;
}

export interface DlqPurgeResult {
  purgedCount: number;
}

export interface DownloadAndMemoryStatsData {
  downloadStats: Asset[];
  storageStats: Asset[];
}

export interface RequeueAssetResult {
  success: boolean;
}

export interface DeleteAssetResult {
  success: boolean;
}
