import { Asset, AssetStatus } from '@prisma/client';

export interface PresignedUrlResult {
  id: string;
  uploadUrl: string;
  rawPath: string;
}

export interface ConfirmUploadResult {
  message: string;
  assetId: string;
  status: AssetStatus;
  isDuplicate?: boolean;
}

export interface FormattedGalleryAsset {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: AssetStatus;
  thumbnailUrl: string | null;
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
  uploaderId: string;
  has1080p: boolean;
  has720p: boolean;
  hasSd: boolean;
  tags: string[];
  uploader?: {
    id: string;
    name: string;
    email: string;
  };
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
