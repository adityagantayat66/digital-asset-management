import { prisma } from '../services/prisma';
import { redisClient } from '../services/redis';
import { AdminMetricsData } from '../utils/models';

export async function getAdminMetrics(): Promise<AdminMetricsData | null> {
    const [totalAssets, totalStorageBytes] = await Promise.all([
        prisma.asset.count(),
        prisma.asset.aggregate({
            _sum: {
                size: true
            }
        })
    ]);
    const totalDownloads = parseInt(await redisClient.get('analytics:total_downloads') || '0', 10);
    const activeWorkers = (await redisClient.keys('worker:heartbeat:*')).length;
    return {
        totalAssets,
        totalStorageBytes: totalStorageBytes._sum.size || 0,
        totalDownloads,
        activeWorkers,
    };
}