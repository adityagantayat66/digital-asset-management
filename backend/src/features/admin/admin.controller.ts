import { Request, Response } from 'express';
import {
  deleteFailedAssets,
  getAdminMetrics,
  getDownloadAndMemoryStats,
  getFailedAssetsFromDB,
  getQueueMetrics,
  getSystemLogs,
  purgeDlq,
  requeueFailedAsset,
  syncDlqToDb,
} from './admin.service';
import { HttpStatus } from '../../utils/httpStatus';
import { sendSuccess, sendError } from '../../utils/apiResponse';
import { ErrorLevel } from '../../utils/models';

/**
 * @Endpoint /api/admin/metrics
 * @Method GET
 * @Description Fetches administrative dashboard infrastructure metrics and aggregate statistics.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function getInfraMetrics(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.getInfraMetrics';
  try {
    const metrics = await getAdminMetrics();

    sendSuccess(res, metrics, 'Admin dashboard data fetched successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error fetching infra metrics',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INFRA_METRICS_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/worker-health
 * @Method GET
 * @Description Retrieves background worker queue health and active message metrics.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function getWorkerHealthMetrics(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.getWorkerHealthMetrics';
  try {
    const health = await getQueueMetrics();

    sendSuccess(res, health, 'Worker health metrics fetched successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error fetching worker health metrics',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'WORKER_HEALTH_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/sync-dlq
 * @Method POST
 * @Description Synchronizes RabbitMQ Dead Letter Queue (DLQ) messages into PostgreSQL failed asset records.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function syncDlq(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.syncDlq';
  try {
    const result = await syncDlqToDb();

    sendSuccess(res, result, 'DLQ synced to database successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error syncing DLQ',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'SYNC_DLQ_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/purge-dlq
 * @Method POST
 * @Description Purges all messages from the RabbitMQ Dead Letter Queue (DLQ).
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function purgeDeadLetters(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.purgeDeadLetters';
  try {
    const result = await purgeDlq();

    sendSuccess(res, result, 'Dead letters purged successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error purging dead letters',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'PURGE_DLQ_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/top-stats
 * @Method GET
 * @Description Fetches top download leaderboard analytics and memory usage statistics.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function getTopStats(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.getTopStats';
  try {
    const stats = await getDownloadAndMemoryStats();

    sendSuccess(res, { ...stats }, 'Top stats fetched successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error fetching top stats',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'TOP_STATS_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/failed-assets
 * @Method GET
 * @Description Fetches a list of all assets currently in FAILED status.
 * @Params req (Request) - Express Request object
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function getFailedAssets(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.getFailedAssets';
  try {
    const assets = await getFailedAssetsFromDB();

    sendSuccess(res, assets, 'Failed assets fetched successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error fetching failed assets',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'GET_FAILED_ASSETS_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/requeue-failed-assets/:assetId
 * @Method POST
 * @Description Re-enqueues a failed asset processing job back into the RabbitMQ queue.
 * @Params req (Request) - Express Request object containing assetId in params
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function retryFailedAssets(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.retryFailedAssets';
  try {
    if (!req.params.assetId) {
      sendError(res, 'Asset ID is required', HttpStatus.BAD_REQUEST, 'BAD_REQUEST');
      return;
    }
    const result = await requeueFailedAsset(req.params.assetId);

    sendSuccess(res, result, 'Failed asset retried successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error for assetId ${req.params?.assetId}:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error retrying failed asset',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'RETRY_FAILED_ASSET_FAILED',
      { function: FUNCTION_NAME, assetId: req.params?.assetId },
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/discard-failed-assets/:assetId
 * @Method DELETE
 * @Description Deletes raw assets from MinIO and removes the failed asset record from PostgreSQL.
 * @Params req (Request) - Express Request object containing assetId in params
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function discardFailedAssets(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.discardFailedAssets';
  try {
    if (!req.params.assetId) {
      sendError(res, 'Asset ID is required', HttpStatus.BAD_REQUEST, 'BAD_REQUEST');
      return;
    }
    const result = await deleteFailedAssets(req.params.assetId);

    sendSuccess(res, result, 'Failed asset discarded successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error for assetId ${req.params?.assetId}:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error discarding failed asset',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DISCARD_FAILED_ASSET_FAILED',
      { function: FUNCTION_NAME, assetId: req.params?.assetId },
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}

/**
 * @Endpoint /api/admin/system-logs
 * @Method GET
 * @Description Fetches system audit and error log records with pagination and filtering.
 * @Params req (Request) - Express Request object containing filter query params
 *         res (Response) - Express Response object
 * @Auth Required
 * @Role ADMIN
 */
export async function fetchSystemLogs(req: Request, res: Response) {
  const FUNCTION_NAME = 'adminController.fetchSystemLogs';
  try {
    const { page, limit, level, origin, search } = req.query;
    const result = await getSystemLogs({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      level: level as string,
      origin: origin as string,
      search: search as string,
    });

    sendSuccess(res, result, 'System logs fetched successfully', HttpStatus.OK);
  } catch (err: any) {
    console.error(`❌ [${FUNCTION_NAME}] Error:`, err);
    sendError(
      res,
      err instanceof Error ? err.message : 'Internal server error fetching system logs',
      HttpStatus.INTERNAL_SERVER_ERROR,
      'FETCH_SYSTEM_LOGS_FAILED',
      null,
      FUNCTION_NAME,
      true,
      req,
      err,
      ErrorLevel.ERROR
    );
  }
}


