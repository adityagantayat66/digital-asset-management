import { Request, Response } from 'express';
import { z } from 'zod';
import {
  generateAssetPresignedUrl,
  confirmUpload,
  getGalleryAssets,
  getAssetDetails,
  processAssetDownload,
} from '../api-services/assetService';
import { redisClient, redisSubscriber } from '../services/redis';
import { HttpStatus } from '../utils/httpStatus';

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
 * @Endpoint /api/assets/presigned-url
 * @Method POST
 * @Description Pre-registers an asset record in PostgreSQL with uploaderId and returns a direct MinIO presigned PUT URL.
 * @Auth Required
 * @Role USER, ADMIN
 */
export async function requestPresignedUrl(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }
    const parsedResult = presignedUrlSchema.safeParse(req.body);
    if (!parsedResult.success) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Validation Error', details: parsedResult.error.format() });
      return;
    }
    const { filename, mimeType, tags, size } = parsedResult.data;

    const result = await generateAssetPresignedUrl({
      filename,
      mimeType,
      size,
      tags,
      userId: req.user.userId,
    });

    res.status(HttpStatus.OK).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Presigned URL Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to generate presigned upload URL' });
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
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }

    const parseResult = completeUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'Validation Error', details: parseResult.error.format() });
      return;
    }

    const { assetId } = parseResult.data;

    const result = await confirmUpload({
      assetId,
      userId: req.user.userId,
      userRole: req.user.role,
    });

    res.status(HttpStatus.ACCEPTED).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Complete Upload Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to acknowledge upload completion' });
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

  // Send current cached progress snapshot from Redis Hash if present
  try {
    const currentProgress = await redisClient.hgetall(`job:${id}:progress`);
    if (currentProgress && Object.keys(currentProgress).length > 0) {
      res.write(
        `data: ${JSON.stringify({
          assetId: id,
          progress: Number(currentProgress.progress || 0),
          status: currentProgress.status || 'QUEUED',
          stage: currentProgress.stage || '',
          updatedAt: currentProgress.updatedAt || new Date().toISOString(),
        })}\n\n`
      );
    }
  } catch (err) {
    console.error(`Failed to read initial progress hash for job:${id}:progress`, err);
  }

  // Subscribe to Redis Pub/Sub channel
  const messageHandler = (channel: string, message: string) => {
    if (channel === channelName) {
      res.write(`data: ${message}\n\n`);
      console.log('This message is sent : ', message);
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
    redisSubscriber.unsubscribe(channelName).catch(() => {});
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

    const userId = req.user?.userId;
    const userRole = req.user?.role;

    const result = await getGalleryAssets({
      page,
      limit,
      search,
      type,
      tag,
      userId,
      userRole,
    });

    res.status(HttpStatus.OK).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ List Assets Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch gallery assets' });
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

    const asset = await getAssetDetails(id);

    res.status(HttpStatus.OK).json(asset);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Get Asset Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch asset metadata' });
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

    const result = await processAssetDownload(id);

    res.status(HttpStatus.OK).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('❌ Download Asset Error:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to process asset download request' });
  }
}
