import { Asset, AssetStatus, Role } from '@prisma/client';

// ==========================================
// 1. ADMIN SERVICE RETURN TYPE INTERFACES
// ==========================================

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

// ==========================================
// 2. AUTH SERVICE RETURN TYPE INTERFACES
// ==========================================

export interface AuthUserInfo {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthUserResult {
  token: string;
  user: AuthUserInfo;
}

export interface UserProfileData {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

// ==========================================
// 3. ASSET SERVICE RETURN TYPE INTERFACES
// ==========================================

export interface PresignedUrlResult {
  id: string;
  uploadUrl: string;
  rawPath: string;
}

export interface ConfirmUploadResult {
  message: string;
  assetId: string;
  status: AssetStatus;
}

export interface FormattedGalleryAsset extends Omit<Asset, 'tags'> {
  thumbnailUrl: string | null;
  tags: string[];
}

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GalleryAssetsResult {
  assets: FormattedGalleryAsset[];
  pagination: PaginationData;
}

export interface AssetDetailsResult extends Omit<Asset, 'tags'> {
  thumbnailUrl: string | null;
  transcodedSdUrl: string | null;
  transcoded720pUrl: string | null;
  transcoded1080pUrl: string | null;
  tags: string[];
}

export interface AssetDownloadResult {
  downloadUrl: string;
  filename: string;
}
