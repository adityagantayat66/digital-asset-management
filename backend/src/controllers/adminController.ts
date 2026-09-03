import { Request, Response } from 'express';
import { deleteFailedAssets, getAdminMetrics, getDownloadAndMemoryStats, getFailedAssetsFromDB, getQueueMetrics, purgeDlq, requeueFailedAsset, syncDlqToDb } from '../api-services/adminService';
import { HttpStatus } from '../utils/httpStatus';

export async function getInfraMetrics(req: Request, res: Response) {
  try {
    const metrics = await getAdminMetrics();

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Admin dashboard data fetched successfully',
      data: metrics
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}
export async function getWorkerHealthMetrics(req: Request, res: Response) {
  try {
    const health = await getQueueMetrics();
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Worker health metrics fetched successfully',
      data: health
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}
export async function syncDlq(req: Request, res: Response) {
  try {
    const result = await syncDlqToDb();
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'DLQ synced to database successfully',
      data: result
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}
export async function purgeDeadLetters(req: Request, res: Response) {
  try {
    const result = await purgeDlq();
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Dead letters purged successfully',
      data: result
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}
export async function getTopStats(req: Request, res: Response) {
  try {
    const stats = await getDownloadAndMemoryStats();
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Top stats fetched successfully',
      data: { ...stats }
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}

export async function getFailedAssets(req: Request, res: Response) {
  try {
    const assets = await getFailedAssetsFromDB();
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Failed assets fetched successfully',
      data: assets
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}
export async function retryFailedAssets(req: Request, res: Response) {
  try {
    if (!req.params.assetId) {
      throw new Error("Asset ID is required");
    }
    const result = await requeueFailedAsset(req.params.assetId);
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Failed asset retried successfully',
      data: result
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}
export async function discardFailedAssets(req: Request, res: Response) {
  try {
    if (!req.params.assetId) {
      throw new Error("Asset ID is required");
    }
    const result = await deleteFailedAssets(req.params.assetId);
    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Failed asset discarded successfully',
      data: result
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}