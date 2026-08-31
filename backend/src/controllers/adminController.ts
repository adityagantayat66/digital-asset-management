import { Request, Response } from 'express';
import { redisClient } from '../services/redis';
import { prisma } from '../services/prisma';
import { AdminMetricsData } from '../utils/models';
import { getAdminMetrics } from '../api-services/adminService';

export async function getAdminDashboardData(req: Request, res: Response) {
  try {
    const metrics: AdminMetricsData | null = await getAdminMetrics();

    res.status(200).json({
      success: true,
      message: 'Admin dashboard data fetched successfully',
      data: metrics
    });
  }
  catch (err) {
    if (err instanceof Error) {
      res.status(500).json({
        success: false,
        message: err.message,
        data: null
      });
    }
    else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        data: null
      });
    }
  }
}