import { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../services/prisma';
import { generatePresignedUploadUrl, generatePresignedDownloadUrl, getPublicAssetUrl } from '../services/minio';
import { publishProcessingJob } from '../services/rabbitmq';
import { redisClient, redisSubscriber } from '../services/redis';
import { env } from '../config/env';

// Validation Schemas using Zod
const presignedUrlSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  mimeType: z.string().min(1, 'MIME type is required'),
  size: z.number().positive('File size must be greater than 0'),
  tags: z.array(z.string()).optional(),
});

const completeUploadSchema = z.object({
  assetId: z.string().uuid('Invalid Asset ID format'),
});

/**
 * @Endpoint  /api/assets/presigned-url
 * @Method POST
 * @Description Pre-registers an asset record in PostgreSQL with uploaderId and returns a direct MinIO presigned PUT URL.
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function requestPresignedUrl(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parsedResult = presignedUrlSchema.safeParse(req.body)
    if (!parsedResult.success) {
      res.status(400).json({ error: 'Validation Error', details: parsedResult.error.format() })
      return;
    }
    const { filename, mimeType, tags = [], size } = parsedResult.data;
    const fileExtension = filename.includes('.') ? filename.substring(filename.lastIndexOf('.')) : '';
    const fileKey = `${uuidv4()}${fileExtension}`;
    const { uploadUrl, rawPath } = await generatePresignedUploadUrl(fileKey, fileExtension);
    const asset = await prisma.asset.create({
      data: {
        originalName: filename,
        mimeType,
        size,
        uploaderId: req.user.userId,
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
          )
        }
      }
    });

    res.status(200).json({ id: asset.id, uploadUrl, rawPath });

  }
  catch (error) {
    console.error('❌ Presigned URL Error:', error);
    res.status(500).json({ error: 'Failed to generate presigned upload URL' });
  }
}

/**
 * @Endpoint /api/assets/complete-upload
 * @Method POST
 * @Description Confirms direct upload completion, updates DB status to QUEUED, and enqueues RabbitMQ task.
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function completeUpload(req: Request, res: Response): Promise<void> {
  try {

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = completeUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation Error', details: parseResult.error.format() });
      return;
    }

    const { assetId } = parseResult.data;

    // 1. Fetch asset from PostgreSQL and verify ownership
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    if (asset.uploaderId !== req.user.userId && req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: You do not own this asset' });
      return;
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

    res.status(202).json({
      message: 'Upload complete. Processing task enqueued successfully.',
      assetId: updatedAsset.id,
      status: updatedAsset.status,
    });
  } catch (error) {
    console.error('❌ Complete Upload Error:', error);
    res.status(500).json({ error: 'Failed to acknowledge upload completion' });
  }
}

/**
 * @Endpoint /api/assets/:id/progress/stream
 * @Method GET
 * @Description Establishes Server-Sent Events (SSE) stream subscribing to Redis Pub/Sub progress events.
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function streamProgress(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx proxy buffering for SSE

  const channelName = `asset:progress:${id}`;

  // Send initial connection handshake event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', assetId: id })}\n\n`);

  // Subscribe to Redis Pub/Sub channel
  const messageHandler = (channel: string, message: string) => {
    if (channel === channelName) {
      res.write(`data: ${message}\n\n`);
      console.log("This message is sent : ", message);
      // Automatically close stream when job reaches terminal state
      try {
        const parsed = JSON.parse(message);
        if (parsed.status === 'COMPLETED' || parsed.status === 'FAILED') {
          cleanup();
          res.end();
        }
      } catch (err) {
        // Ignore JSON parse errors
      }
    }
  };

  const cleanup = () => {
    redisSubscriber.unsubscribe(channelName).catch(() => { });
    redisSubscriber.removeListener('message', messageHandler);
  };

  redisSubscriber.subscribe(channelName).catch((err) => {
    console.error(`❌ Redis Subscribe Error for ${channelName}:`, err);
  });

  redisSubscriber.on('message', messageHandler);

  // Clean up resources if client closes connection
  req.on('close', () => {
    cleanup();
  });
}

/**
 * @Endpoint /api/assets
 * @Method GET
 * @Description Lists gallery assets with search, type filter, tag filter, pagination, and 60s Redis caching.
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function listAssets(req: Request, res: Response): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const search = (req.query.search as string) || '';
    const type = (req.query.type as string) || ''; // 'image' or 'video'
    const tag = (req.query.tag as string) || '';

    const cacheKey = `cache:gallery:p${page}:l${limit}:s${search}:t${type}:tg${tag}`;

    // 1. Check Redis Cache
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      res.status(200).json(JSON.parse(cachedData));
      return;
    }

    // 2. Build Prisma Where Clause
    const where: any = {};

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

    res.status(200).json(result);
  } catch (error) {
    console.error('❌ List Assets Error:', error);
    res.status(500).json({ error: 'Failed to fetch gallery assets' });
  }
}

/**
 * @Endpoint /api/assets/:id
 * @Method GET
 * @Description Fetches asset details with signed streaming URLs.
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function getAssetById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        uploader: { select: { id: true, name: true, email: true } },
      },
    });

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    // Generate static public URL for thumbnail, signed URLs for video streams
    const thumbnailUrl = asset.thumbnailUrl ? getPublicAssetUrl(env.MINIO_PROCESSED_BUCKET, asset.thumbnailUrl) : null;
    let transcoded720pUrl = asset.transcoded720pUrl;
    let transcoded1080pUrl = asset.transcoded1080pUrl;

    if (transcoded720pUrl && !transcoded720pUrl.startsWith('http')) {
      transcoded720pUrl = await generatePresignedDownloadUrl(env.MINIO_PROCESSED_BUCKET, transcoded720pUrl);
    }
    if (transcoded1080pUrl && !transcoded1080pUrl.startsWith('http')) {
      transcoded1080pUrl = await generatePresignedDownloadUrl(env.MINIO_PROCESSED_BUCKET, transcoded1080pUrl);
    }

    res.status(200).json({
      ...asset,
      thumbnailUrl,
      transcoded720pUrl,
      transcoded1080pUrl,
      tags: asset.tags.map((t) => t.tag.name),
    });
  } catch (error) {
    console.error('❌ Get Asset Error:', error);
    res.status(500).json({ error: 'Failed to fetch asset metadata' });
  }
}

/**
 * @Endpoint /api/assets/:id/download
 * @Method GET
 * @Description Increments Redis download counters and generates presigned download URL.
 * @Auth Required
 * @Role ADMIN
 */
export async function downloadAsset(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
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

    res.status(200).json({ downloadUrl, filename: asset.originalName });
  } catch (error) {
    console.error('❌ Download Asset Error:', error);
    res.status(500).json({ error: 'Failed to process asset download request' });
  }
}
