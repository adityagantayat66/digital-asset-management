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
import { sendSuccess, sendError } from '../utils/apiResponse';
import { LoggerService } from '../services/logger';

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
  const FUNCTION_NAME = 'assetController.requestPresignedUrl';
  try {
    if (!req.user) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Missing user auth context`);
      sendError(res, 'Unauthorized', HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
      return;
    }
    const parsedResult = presignedUrlSchema.safeParse(req.body);
    if (!parsedResult.success) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Validation failed:`, parsedResult.error.format());
      sendError(res, 'Validation Error', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', parsedResult.error.format());
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

    sendSuccess(res, result, 'Presigned URL generated successfully', HttpStatus.OK);
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to generate presigned upload URL:`, error);
    if (error.statusCode) {
      sendError(res, error.message, error.statusCode, error.statusCode === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'PRESIGNED_URL_ERROR', null,
        FUNCTION_NAME,
        true,
        req,
        error);
      return;
    }
    sendError(res, 'Failed to generate presigned upload URL', HttpStatus.INTERNAL_SERVER_ERROR, 'PRESIGNED_URL_FAILED', null,
      FUNCTION_NAME,
      true,
      req,
      error);
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
  const FUNCTION_NAME = 'assetController.completeUpload';
  try {
    if (!req.user) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Missing user auth context`);
      sendError(res, 'Unauthorized', HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED');
      return;
    }

    const parseResult = completeUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.warn(`⚠️ [${FUNCTION_NAME}] Validation failed:`, parseResult.error.format());
      sendError(res, 'Validation Error', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', parseResult.error.format());
      return;
    }

    const { assetId } = parseResult.data;

    const result = await confirmUpload({
      assetId,
      userId: req.user.userId,
      userRole: req.user.role,
    });

    sendSuccess(res, result, result.message, HttpStatus.ACCEPTED);
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to acknowledge upload completion:`, error);
    if (error.statusCode) {
      sendError(res, error.message, error.statusCode, error.statusCode === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'FORBIDDEN', null,
        FUNCTION_NAME,
        true,
        req,
        error);
      return;
    }
    sendError(res, 'Failed to acknowledge upload completion', HttpStatus.INTERNAL_SERVER_ERROR, 'COMPLETE_UPLOAD_FAILED', null,
      FUNCTION_NAME,
      true,
      req,
      error);
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
  const FUNCTION_NAME = 'assetController.listAssets';
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

    sendSuccess(res, result, 'Gallery assets fetched successfully', HttpStatus.OK);
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to fetch gallery assets:`, error);
    if (error.statusCode) {
      sendError(res, error.message, error.statusCode, error.statusCode === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'LIST_ASSETS_ERROR', null,
        FUNCTION_NAME,
        true,
        req,
        error);
      return;
    }
    sendError(res, 'Failed to fetch gallery assets', HttpStatus.INTERNAL_SERVER_ERROR, 'LIST_ASSETS_FAILED', null,
      FUNCTION_NAME,
      true,
      req,
      error,
    );
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
  const FUNCTION_NAME = 'assetController.getAssetById';
  try {
    const { id } = req.params;

    const asset = await getAssetDetails(id);

    sendSuccess(res, asset, 'Asset metadata fetched successfully', HttpStatus.OK);
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to fetch asset details for ID ${req.params?.id}:`, error);
    if (error.statusCode) {
      sendError(res, error.message, error.statusCode, error.statusCode === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'GET_ASSET_ERROR', null,
        FUNCTION_NAME,
        true,
        req,
        error);
      return;
    }
    sendError(res, 'Failed to fetch asset metadata', HttpStatus.INTERNAL_SERVER_ERROR, 'GET_ASSET_FAILED', null,
      FUNCTION_NAME,
      true,
      req,
      error);

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
  const FUNCTION_NAME = 'assetController.downloadAsset';
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, 'Asset ID is required', HttpStatus.BAD_REQUEST, 'BAD_REQUEST');
      return;
    }
    const result = await processAssetDownload(id);

    sendSuccess(res, result, 'Asset download URL generated successfully', HttpStatus.OK);
  } catch (error: any) {
    console.error(`❌ [${FUNCTION_NAME}] Failed to process asset download request for ID ${req.params?.id}:`, error);
    if (error.statusCode) {
      sendError(res, error.message, error.statusCode, error.statusCode === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'DOWNLOAD_ASSET_ERROR', null,
        FUNCTION_NAME,
        true,
        req,
        error);
      return;
    }
    sendError(res, 'Failed to process asset download request', HttpStatus.INTERNAL_SERVER_ERROR, 'DOWNLOAD_ASSET_FAILED', null,
      FUNCTION_NAME,
      true,
      req,
      error);
  }
}
