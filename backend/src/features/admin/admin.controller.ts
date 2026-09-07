import { Request, Response } from 'express';
import {
  deleteFailedAssets,
  getAdminMetrics,
  getDownloadAndMemoryStats,
  getFailedAssetsFromDB,
  getQueueMetrics,
  purgeDlq,
  requeueFailedAsset,
  syncDlqToDb,
} from './admin.service';
import { HttpStatus } from '../../utils/httpStatus';
import { sendSuccess, sendError } from '../../utils/apiResponse';

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
      err
    );
  }
}

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
      err
    );
  }
}

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
      err
    );
  }
}

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
      err
    );
  }
}

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
      err
    );
  }
}

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
      err
    );
  }
}

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
      err
    );
  }
}

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
      err
    );
  }
}
