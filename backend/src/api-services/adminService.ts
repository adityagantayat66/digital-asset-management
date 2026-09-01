import { Asset } from '@prisma/client';
import { prisma } from '../services/prisma';
import { connectRabbitMQ, publishProcessingJob, QUEUE_ASSET_PROCESSING } from '../services/rabbitmq';
import { redisClient } from '../services/redis';
import { AdminMetricsData } from '../utils/models';
import { deleteS3Object } from '../services/minio';
import { env } from '../config/env';

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
export async function getQueueMetrics() {
    const channel = await connectRabbitMQ()
    const [queueInfo, dlqInfo, activeProcessingJobs, distributedJobLocks, workerHeartbeatKeys, failedAssetsCount] = await Promise.all([
        channel.checkQueue(QUEUE_ASSET_PROCESSING),
        channel.checkQueue(`${QUEUE_ASSET_PROCESSING}_dead_letters`),
        prisma.asset.count({ where: { status: 'PROCESSING' } }),
        redisClient.keys('lock:job:*'),
        redisClient.keys('worker:heartbeat:*'),
        prisma.asset.count({ where: { status: 'FAILED' } })
    ]);
    const nodes = await Promise.all(
        workerHeartbeatKeys.map(async (key) => ({
            id: key.replace('worker:heartbeat:', ''),
            status: 'ONLINE' as const,
            ttlRemainingSeconds: await redisClient.ttl(key)
        }))
    );
    return {
        queueDepth: {
            pendingJobs: queueInfo.messageCount,
            activeProcessingJobs,
        },
        dlq: {
            queueDepth: dlqInfo.messageCount,
        },
        failedAssetsCount,
        workers: {
            activeNodes: workerHeartbeatKeys.length,
            nodes,
        },
        locks: {
            activeJobLocks: distributedJobLocks.length,
        },
    };
}
// backend/src/api-services/adminService.ts
export async function syncDlqToDb(): Promise<{ syncedCount: number }> {
    const channel = await connectRabbitMQ();
    const dlqQueue = `${QUEUE_ASSET_PROCESSING}_dead_letters`;
    let syncedCount = 0;

    while (true) {
        // Read non-blockingly from DLQ
        const msg = await channel.get(dlqQueue, { noAck: false });
        if (!msg) break;

        try {
            const payload = JSON.parse(msg.content.toString());
            const targetAssetId = payload.assetId || payload.id || (typeof payload === 'string' ? payload : null);
            if (targetAssetId) {
                const result = await prisma.asset.updateMany({
                    where: {
                        id: targetAssetId,
                        status: { in: ['PENDING_UPLOAD', 'QUEUED', 'PROCESSING'] },
                    },
                    data: {
                        status: 'FAILED',
                        errorMessage: 'Dead Lettered: Unacknowledged worker crash or system termination',
                    },
                });
                syncedCount += result.count;

            }
        } catch (err) {
            console.error('❌ Error parsing DLQ message payload:', err);
        } finally {
            channel.ack(msg); // Remove processed message from DLQ
        }
    }

    return { syncedCount };
}

export async function purgeDlq(): Promise<{ purgedCount: number }> {
    const channel = await connectRabbitMQ();
    const dlqQueue = `${QUEUE_ASSET_PROCESSING}_dead_letters`;
    const result = await channel.purgeQueue(dlqQueue);
    return { purgedCount: result.messageCount };
}

export async function getDownloadAndMemoryStats(): Promise<{
    downloadStats: Asset[];
    storageStats: Asset[];
}> {
    // 1. Fetch Top 3 Asset IDs from Redis Sorted Set (RAM)
    const topAssetIds = await redisClient.zrevrange('analytics:top_downloads', 0, 2);

    // 2. Shared uploader select object (DRY)
    const uploaderSelect = { select: { id: true, name: true, email: true } };

    // 3. Cold / Empty Cache Fallback
    if (topAssetIds.length === 0) {
        const [downloadStats, storageStats] = await Promise.all([
            prisma.asset.findMany({
                orderBy: { downloadCount: 'desc' },
                take: 3,
                include: { uploader: uploaderSelect },
            }),
            prisma.asset.findMany({
                orderBy: { size: 'desc' },
                take: 3,
                include: { uploader: uploaderSelect },
            }),
        ]);
        return { downloadStats, storageStats };
    }

    // 4. Warm Cache Execution: Batch query PostgreSQL concurrently
    const [dbAssets, storageStats] = await Promise.all([
        prisma.asset.findMany({
            where: { id: { in: topAssetIds } },
            include: { uploader: uploaderSelect },
        }),
        prisma.asset.findMany({
            orderBy: { size: 'desc' },
            take: 3,
            include: { uploader: uploaderSelect },
        }),
    ]);

    // 5. Preserve exact Redis leaderboard rank order
    const assetMap = new Map(dbAssets.map((asset) => [asset.id, asset]));
    const sortedDownloadStats = topAssetIds
        .map((id) => assetMap.get(id))
        .filter(Boolean);

    return {
        downloadStats: sortedDownloadStats as Asset[],
        storageStats: storageStats as Asset[],
    };
}
export async function getFailedAssetsFromDB(): Promise<Asset[]> {
    return await prisma.asset.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        include: { uploader: { select: { id: true, name: true, email: true } } },
    });
}

export async function requeueFailedAsset(assetId: string): Promise<{ success: boolean }> {
    const asset = await prisma.asset.findUnique({
        where: { id: assetId },
    });
    if (!asset) {
        throw new Error('Asset not found');
    }
    await prisma.asset.update({
        where: { id: assetId },
        data: {
            status: 'QUEUED',
            errorMessage: null,
        },
    });
    const payload = {
        assetId: asset.id,
        rawPath: asset.rawPath,
        originalName: asset.originalName,
        mimeType: asset.mimeType,
    };
    await publishProcessingJob(payload)
    return { success: true };
}
export async function deleteFailedAssets(assetId: string): Promise<{ success: boolean }> {
    try {
        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!asset) throw new Error('Asset not found');
        // 1. Delete raw file from MinIO raw-assets bucket if rawPath exists
        if (asset.rawPath) {
            const objectKey = asset.rawPath.includes('/') ? asset.rawPath.split('/')[1] : asset.rawPath;
            await deleteS3Object(env.MINIO_RAW_BUCKET, objectKey).catch((err) => {
                console.warn(`⚠️ MinIO deletion error for ${objectKey}:`, err.message);
            });
        }
        // 2. Delete database record
        await prisma.asset.delete({ where: { id: assetId } });
        // 3. Invalidate Redis gallery caches
        const cacheKeys = await redisClient.keys('cache:gallery:*');
        if (cacheKeys.length > 0) await redisClient.del(...cacheKeys);
        return { success: true };
    } catch (error) {
        console.error('Error deleting asset:', error);
        throw error;
    }
}