import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AssetStatus } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { generatePresignedUploadUrl, generatePresignedDownloadUrl, getPublicAssetUrl, copyS3Object } from '../../services/minio';
import { publishProcessingJob } from '../../services/rabbitmq';
import { redisClient } from '../../services/redis';
import { env } from '../../config/env';
import { HttpStatus } from '../../utils/httpStatus';
import {
  PresignedUrlResult,
  ConfirmUploadResult,
  GalleryAssetsResult,
  AssetDetailsResult,
  AssetDownloadResult,
} from './asset.models';

export interface RequestPresignedUrlOptions {
  filename: string;
  mimeType: string;
  size: number;
  tags?: string[];
  userId: string;
}

export interface ConfirmUploadOptions {
  assetId: string;
  checksum?: string;
  userId: string;
  userRole?: string;
}

export interface ListAssetsOptions {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  tag?: string;
  userId?: string;
  userRole?: string;
}

/**
 * @Description Generates a presigned MinIO upload URL and creates a pending asset record in PostgreSQL.
 * @Params options (RequestPresignedUrlOptions) - Object containing filename, mimeType, size, tags, and userId
 * @Returns Promise<PresignedUrlResult> - Asset ID, presigned PUT URL, and S3 raw object path
 */
export async function generateAssetPresignedUrl(options: RequestPresignedUrlOptions): Promise<PresignedUrlResult> {
  const { filename, mimeType, tags = [], size, userId } = options;
  const fileExtension = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
  const fileKey = `${uuidv4()}${fileExtension}`;
  const { uploadUrl, rawPath } = await generatePresignedUploadUrl(fileKey, mimeType);

  const asset = await prisma.asset.create({
    data: {
      originalName: filename,
      mimeType,
      size,
      uploaderId: userId,
      status: AssetStatus.PENDING_UPLOAD,
      rawPath,
      tags: {
        create: await Promise.all(
          tags.map(async (tagName) => {
            const tag = await prisma.tag.upsert({
              where: { name: tagName.toLowerCase().trim() },
              update: {},
              create: { name: tagName.toLowerCase().trim() },
            });
            return { tagId: tag.id };
          })
        ),
      },
    },
  });

  return { id: asset.id, uploadUrl, rawPath };
}

/**
 * @Description Confirms upload completion, handles instant deduplication via server-side S3 copying if checksum matches, or enqueues processing job to RabbitMQ.
 * @Params options (ConfirmUploadOptions) - Object containing assetId, optional checksum, userId, and userRole
 * @Returns Promise<ConfirmUploadResult> - Confirmation status message, asset ID, and deduplication flag
 */
export async function confirmUpload(options: ConfirmUploadOptions): Promise<ConfirmUploadResult> {
  const { assetId, checksum, userId, userRole } = options;

  // 1. Fetch asset from PostgreSQL and verify ownership
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) {
    const error: any = new Error('Asset not found');
    error.statusCode = HttpStatus.NOT_FOUND;
    throw error;
  }

  if (asset.uploaderId !== userId && userRole !== 'ADMIN') {
    const error: any = new Error('Forbidden: You do not own this asset');
    error.statusCode = HttpStatus.FORBIDDEN;
    throw error;
  }

  // 2. Check if an identical asset with matching checksum has already been processed
  if (checksum) {
    const existingAsset = await prisma.asset.findFirst({
      where: {
        checksum,
        status: AssetStatus.COMPLETED,
        id: { not: assetId },
      },
    });

    if (existingAsset) {
      console.log(`⚡ Instant Deduplication Hit for Asset "${assetId}" matching ETag "${checksum}"`);

      // Helper to perform fast server-side S3 object copying in MinIO so each duplicate asset owns its own S3 key lifecycle.
      // S3 CopyObject requires:
      // 1. sourceBucket: 'processed-assets'
      // 2. sourceKey: existing S3 object key (e.g., 'thumbnails/userA_123.jpg')
      // 3. targetBucket: 'processed-assets'
      // 4. targetKey: new S3 object key for this asset (e.g., 'thumbnails/userB_456.jpg')
      const copyAssetObject = async (sourceKey: string, defaultExtension: string): Promise<string> => {
        // Extract S3 folder path (e.g., 'thumbnails' or 'transcoded/1080p') and file extension (e.g., '.jpg' or '.mp4')
        const folderPath = path.posix.dirname(sourceKey);
        const fileExtension = path.posix.extname(sourceKey) || defaultExtension;

        // Construct target object key for the newly uploaded asset ID
        const targetKey = `${folderPath}/${asset.id}${fileExtension}`;

        try {
          await copyS3Object(
            env.MINIO_PROCESSED_BUCKET, // Source Bucket
            sourceKey,                  // Source Key in MinIO
            env.MINIO_PROCESSED_BUCKET, // Target Bucket
            targetKey                   // Target Key in MinIO
          );
          return targetKey;
        } catch (err: any) {
          console.warn(`⚠️ Failed to copy S3 object from "${sourceKey}" to "${targetKey}", falling back:`, err?.message || err);
          return sourceKey;
        }
      };

      const [thumbnailUrl, transcodedSdUrl, transcoded720pUrl, transcoded1080pUrl] = await Promise.all([
        existingAsset.thumbnailUrl ? copyAssetObject(existingAsset.thumbnailUrl, '.jpg') : Promise.resolve(null),
        existingAsset.transcodedSdUrl ? copyAssetObject(existingAsset.transcodedSdUrl, '.mp4') : Promise.resolve(null),
        existingAsset.transcoded720pUrl ? copyAssetObject(existingAsset.transcoded720pUrl, '.mp4') : Promise.resolve(null),
        existingAsset.transcoded1080pUrl ? copyAssetObject(existingAsset.transcoded1080pUrl, '.mp4') : Promise.resolve(null),
      ]);

      const deduplicatedAsset = await prisma.asset.update({
        where: { id: asset.id },
        data: {
          checksum,
          status: AssetStatus.COMPLETED,
          thumbnailUrl,
          transcodedSdUrl,
          transcoded720pUrl,
          transcoded1080pUrl,
        },
      });

      // Update Redis hash to COMPLETED so SSE listeners close cleanly
      await redisClient.hset(`job:${asset.id}:progress`, {
        progress: '100',
        status: AssetStatus.COMPLETED,
        stage: 'deduplicated',
        updatedAt: new Date().toISOString(),
      });

      // Invalidate gallery query caches in Redis
      const cacheKeys = await redisClient.keys('cache:gallery:*');
      if (cacheKeys.length > 0) {
        await redisClient.del(...cacheKeys);
      }

      return {
        message: 'The same video/image already exists. Processed instantly!',
        assetId: deduplicatedAsset.id,
        status: deduplicatedAsset.status,
        isDuplicate: true,
      };
    }
  }

  // 3. Initialize progress state in Redis
  await redisClient.hset(`job:${asset.id}:progress`, {
    progress: '0',
    status: AssetStatus.QUEUED,
    updatedAt: new Date().toISOString(),
  });

  // 4. Update DB asset status to QUEUED and save checksum
  const updatedAsset = await prisma.asset.update({
    where: { id: asset.id },
    data: {
      status: AssetStatus.QUEUED,
      ...(checksum ? { checksum } : {}),
    },
  });

  // 5. Enqueue task payload to RabbitMQ worker queue
  await publishProcessingJob({
    assetId: updatedAsset.id,
    rawPath: updatedAsset.rawPath,
    originalName: updatedAsset.originalName,
    mimeType: updatedAsset.mimeType,
  });

  // 6. Invalidate gallery query caches in Redis
  const cacheKeys = await redisClient.keys('cache:gallery:*');
  if (cacheKeys.length > 0) {
    await redisClient.del(...cacheKeys);
  }

  return {
    message: 'Upload complete. Processing task enqueued successfully.',
    assetId: updatedAsset.id,
    status: updatedAsset.status,
    isDuplicate: false,
  };
}

/**
 * @Description Queries paginated gallery assets from PostgreSQL with filtering, search, and 60-second Redis query caching.
 * @Params options (ListAssetsOptions) - Query options including page, limit, search, type, tag, userId, userRole
 * @Returns Promise<GalleryAssetsResult> - Paginated list of assets with formatted public thumbnail URLs
 */
export async function getGalleryAssets(options: ListAssetsOptions): Promise<GalleryAssetsResult> {
  const { page, limit, search = '', type = '', tag = '', userId, userRole } = options;

  const cacheKey = `cache:gallery:u:${userId || 'all'}:p${page}:l${limit}:s${search}:t${type}:tg${tag}`;

  // 1. Check Redis Cache
  const cachedData = await redisClient.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  // 2. Build Prisma Where Clause
  const where: any = {};
  if (userId && userRole !== 'ADMIN') {
    where.uploaderId = userId;
  }
  if (search) {
    where.originalName = { contains: search, mode: 'insensitive' };
  }

  if (type === 'image') {
    where.mimeType = { startsWith: 'image/' };
  } else if (type === 'video') {
    where.mimeType = { startsWith: 'video/' };
  }

  if (tag) {
    where.tags = {
      some: {
        tag: { name: tag.toLowerCase() },
      },
    };
  }

  // 3. Query PostgreSQL DB
  const skip = (page - 1) * limit;

  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tags: { include: { tag: true } },
        uploader: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const result: GalleryAssetsResult = {
    assets: assets.map((asset) => ({
      id: asset.id,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      status: asset.status,
      thumbnailUrl: asset.thumbnailUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.thumbnailUrl) : null,
      downloadCount: asset.downloadCount,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      uploaderId: asset.uploaderId,
      has1080p: Boolean(asset.transcoded1080pUrl),
      has720p: Boolean(asset.transcoded720pUrl),
      hasSd: Boolean(asset.transcodedSdUrl),
      tags: asset.tags.map((t) => t.tag.name),
      uploader: asset.uploader,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
  // 4. Cache result in Redis for 60 seconds
  await redisClient.setex(cacheKey, 60, JSON.stringify(result));

  return result;
}

/**
 * @Description Retrieves single asset metadata and generates presigned download URLs for streaming media representations.
 * @Params id (string) - Asset UUID
 * @Returns Promise<AssetDetailsResult> - Detailed asset metadata with presigned streaming URLs
 */
export async function getAssetDetails(id: string): Promise<AssetDetailsResult> {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      uploader: { select: { id: true, name: true, email: true } },
    },
  });

  if (!asset) {
    const error: any = new Error('Asset not found');
    error.statusCode = HttpStatus.NOT_FOUND;
    throw error;
  }

  // Format clean public asset URLs for thumbnail and video streams (authenticated via Nginx auth_request)
  const thumbnailUrl = asset.thumbnailUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.thumbnailUrl) : null;
  const transcodedSdUrl = asset.transcodedSdUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.transcodedSdUrl) : null;
  const transcoded720pUrl = asset.transcoded720pUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.transcoded720pUrl) : null;
  const transcoded1080pUrl = asset.transcoded1080pUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.transcoded1080pUrl) : null;

  return {
    ...asset,
    thumbnailUrl,
    transcodedSdUrl,
    transcoded720pUrl,
    transcoded1080pUrl,
    tags: asset.tags.map((t) => t.tag.name),
  };
}

/**
 * @Description Increments Redis analytics counters and generates a presigned download URL for the master raw asset file.
 * @Params id (string) - Asset UUID
 * @Returns Promise<AssetDownloadResult> - Presigned download URL and original filename
 */
export async function processAssetDownload(id: string): Promise<AssetDownloadResult> {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) {
    const error: any = new Error('Asset not found');
    error.statusCode = HttpStatus.NOT_FOUND;
    throw error;
  }

  // 1. Increment Redis download analytics counters
  await redisClient.incr(`asset:${id}:downloads`);
  await redisClient.incr('analytics:total_downloads');
  await redisClient.zincrby('analytics:top_downloads', 1, id);

  // 2. Increment PostgreSQL download count
  await prisma.asset.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });

  // 3. Generate presigned download URL for master file in raw-assets bucket
  const fileKey = asset.rawPath.includes('/') ? asset.rawPath.split('/')[1] : asset.rawPath;
  const downloadUrl = await generatePresignedDownloadUrl(env.MINIO_RAW_BUCKET, fileKey);

  return { downloadUrl, filename: asset.originalName };
}
