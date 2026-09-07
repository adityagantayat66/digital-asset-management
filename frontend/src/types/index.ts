export interface User {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  createdAt?: string;
}

export interface AuthResponse {
  message?: string;
  token: string;
  user: User;
}

export interface Tag {
  id: string;
  name: string;
}

export const AssetStatus = {
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export interface Asset {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  rawPath: string;
  thumbnailUrl: string | null;
  transcodedSdUrl: string | null;
  transcoded720pUrl: string | null;
  transcoded1080pUrl: string | null;
  checksum?: string | null;
  status: AssetStatus;
  errorMessage?: string | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  uploaderId: string;
  tags: string[];
  uploader?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface PresignedUrlResponse {
  id: string;
  uploadUrl: string;
  rawPath: string;
}

export interface SSEProgressPayload {
  type?: 'CONNECTED';
  assetId: string;
  progress?: number;
  status?: AssetStatus;
  stage?: string;
  error?: string;
  updatedAt?: string;
}

export interface AssetsListResponse {
  assets: Asset[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface AdminMetricsData {
  totalStorageBytes: number;
  totalAssets: number;
  totalDownloads: number;
  activeWorkers: number;
}

export interface WorkerNodeDetail {
  id: string;
  status: 'ONLINE' | 'BUSY';
  ttlRemainingSeconds: number;
}

export interface LastCronJobDetail {
  timestamp: string;
  deletedCount: number;
  message: string;
  executedBy?: string;
}

export interface WorkerHealthData {
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
  lastCronJob?: LastCronJobDetail | null;
}
interface Uploader {
  name: string,
  email: string,
  id: string
}
export interface TopAssetItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  downloadCount: number;
  thumbnailUrl: string | null;
  uploader: Uploader;
}

export interface FailedAssetItem {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  errorMessage: string;
  createdAt: string;
  uploader: Uploader;
}

