import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../services/prisma';
import { generatePresignedUploadUrl, generatePresignedDownloadUrl, getPublicAssetUrl } from '../services/minio';
import { publishProcessingJob } from '../services/rabbitmq';
import { redisClient } from '../services/redis';
import { env } from '../config/env';
import { HttpStatus } from '../utils/httpStatus';
import {
  PresignedUrlResult,
  ConfirmUploadResult,
  GalleryAssetsResult,
  AssetDetailsResult,
  AssetDownloadResult,
} from '../utils/models';

export interface RequestPresignedUrlOptions {
  filename: string;
  mimeType: string;
  size: number;
  tags?: string[];
  userId: string;
}

export interface ConfirmUploadOptions {
  assetId: string;
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
      status: 'PENDING_UPLOAD',
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

export async function confirmUpload(options: ConfirmUploadOptions): Promise<ConfirmUploadResult> {
  const { assetId, userId, userRole } = options;

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

  // 2. Initialize progress state in Redis
  await redisClient.hset(`job:${asset.id}:progress`, {
    progress: '0',
    status: 'QUEUED',
    updatedAt: new Date().toISOString(),
  });

  // 3. Update DB asset status to QUEUED
  const updatedAsset = await prisma.asset.update({
    where: { id: asset.id },
    data: { status: 'QUEUED' },
  });

  // 4. Enqueue task payload to RabbitMQ worker queue
  await publishProcessingJob({
    assetId: updatedAsset.id,
    rawPath: updatedAsset.rawPath,
    originalName: updatedAsset.originalName,
    mimeType: updatedAsset.mimeType,
  });

  // 5. Invalidate gallery query caches in Redis
  const cacheKeys = await redisClient.keys('cache:gallery:*');
  if (cacheKeys.length > 0) {
    await redisClient.del(...cacheKeys);
  }

  return {
    message: 'Upload complete. Processing task enqueued successfully.',
    assetId: updatedAsset.id,
    status: updatedAsset.status,
  };
}

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

  const result = {
    assets: assets.map((asset) => ({
      ...asset,
      thumbnailUrl: asset.thumbnailUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.thumbnailUrl) : null,
      tags: asset.tags.map((t) => t.tag.name),
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

  // Generate static public URL for thumbnail, signed URLs for video streams
  const thumbnailUrl = asset.thumbnailUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.thumbnailUrl) : null;
  let transcodedSdUrl = asset.transcodedSdUrl;
  let transcoded720pUrl = asset.transcoded720pUrl;
  let transcoded1080pUrl = asset.transcoded1080pUrl;

  if (transcodedSdUrl && !transcodedSdUrl.startsWith('http')) {
    transcodedSdUrl = await generatePresignedDownloadUrl(env.MINIO_PROCESSED_BUCKET, transcodedSdUrl);
  }
  if (transcoded720pUrl && !transcoded720pUrl.startsWith('http')) {
    transcoded720pUrl = await generatePresignedDownloadUrl(env.MINIO_PROCESSED_BUCKET, transcoded720pUrl);
  }
  if (transcoded1080pUrl && !transcoded1080pUrl.startsWith('http')) {
    transcoded1080pUrl = await generatePresignedDownloadUrl(env.MINIO_PROCESSED_BUCKET, transcoded1080pUrl);
  }

  return {
    ...asset,
    thumbnailUrl,
    transcodedSdUrl,
    transcoded720pUrl,
    transcoded1080pUrl,
    tags: asset.tags.map((t) => t.tag.name),
  };
}

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
