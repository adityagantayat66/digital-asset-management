import { Asset, AssetStatus } from '@prisma/client';
import { prisma } from '../../services/prisma';
import { connectRabbitMQ, publishProcessingJob, QUEUE_ASSET_PROCESSING } from '../../services/rabbitmq';
import { redisClient } from '../../services/redis';
import {
  AdminMetricsData,
  QueueMetricsData,
  DlqSyncResult,
  DlqPurgeResult,
  DownloadAndMemoryStatsData,
  RequeueAssetResult,
  DeleteAssetResult,
} from './admin.models';
import { deleteS3Object } from '../../services/minio';
import { env } from '../../config/env';

/**
 * @Description Aggregates administrative dashboard metrics including total assets, storage volume, download count, and worker node count.
 * @Returns Promise<AdminMetricsData | null> - High-level system metrics
 */
export async function getAdminMetrics(): Promise<AdminMetricsData | null> {
  const [totalAssets, totalStorageBytes] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.aggregate({
      _sum: {
        size: true,
      },
    }),
  ]);
  const totalDownloads = parseInt((await redisClient.get('analytics:total_downloads')) || '0', 10);
  const activeWorkers = (await redisClient.keys('worker:heartbeat:*')).length;
  return {
    totalAssets,
    totalStorageBytes: totalStorageBytes._sum.size || 0,
    totalDownloads,
    activeWorkers,
  };
}

/**
 * @Description Queries RabbitMQ queue depth, DLQ message count, Redis locks, and active worker heartbeats.
 * @Returns Promise<QueueMetricsData> - Detailed queue and worker cluster health metrics
 */
export async function getQueueMetrics(): Promise<QueueMetricsData> {
  const channel = await connectRabbitMQ();
  const [queueInfo, dlqInfo, activeProcessingJobs, distributedJobLocks, workerHeartbeatKeys, failedAssetsCount, rawCronLog] =
    await Promise.all([
      channel.checkQueue(QUEUE_ASSET_PROCESSING),
      channel.checkQueue(`${QUEUE_ASSET_PROCESSING}_dead_letters`),
      prisma.asset.count({ where: { status: AssetStatus.PROCESSING } }),
      redisClient.keys('lock:job:*'),
      redisClient.keys('worker:heartbeat:*'),
      prisma.asset.count({ where: { status: AssetStatus.FAILED } }),
      redisClient.get('cron:last_executed'),
    ]);
  const nodes = await Promise.all(
    workerHeartbeatKeys.map(async (key) => ({
      id: key.replace('worker:heartbeat:', ''),
      status: 'ONLINE' as const,
      ttlRemainingSeconds: await redisClient.ttl(key),
    }))
  );
  let lastCronJob = null;
  if (rawCronLog) {
    try {
      lastCronJob = JSON.parse(rawCronLog);
    } catch {
      lastCronJob = null;
    }
  }
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
    lastCronJob,
  };
}

/**
 * @Description Drains unacknowledged messages from RabbitMQ Dead Letter Queue (DLQ) and updates PostgreSQL asset status to FAILED.
 * @Returns Promise<DlqSyncResult> - Count of synced failed asset records
 */
export async function syncDlqToDb(): Promise<DlqSyncResult> {
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
            status: { in: [AssetStatus.PENDING_UPLOAD, AssetStatus.QUEUED, AssetStatus.PROCESSING] },
          },
          data: {
            status: AssetStatus.FAILED,
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

/**
 * @Description Purges all dead letter messages from the RabbitMQ DLQ.
 * @Returns Promise<DlqPurgeResult> - Number of purged messages
 */
export async function purgeDlq(): Promise<DlqPurgeResult> {
  const channel = await connectRabbitMQ();
  const dlqQueue = `${QUEUE_ASSET_PROCESSING}_dead_letters`;
  const result = await channel.purgeQueue(dlqQueue);
  return { purgedCount: result.messageCount };
}

/**
 * @Description Fetches top download leaderboard analytics and storage consumption statistics from Redis and PostgreSQL.
 * @Returns Promise<DownloadAndMemoryStatsData> - Top asset download and storage statistics
 */
export async function getDownloadAndMemoryStats(): Promise<DownloadAndMemoryStatsData> {
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

/**
 * @Description Retrieves a list of all assets currently in FAILED status from PostgreSQL.
 * @Returns Promise<Asset[]> - List of failed asset records with uploader details
 */
export async function getFailedAssetsFromDB(): Promise<Asset[]> {
  return await prisma.asset.findMany({
    where: { status: AssetStatus.FAILED },
    orderBy: { updatedAt: 'desc' },
    include: { uploader: { select: { id: true, name: true, email: true } } },
  });
}

/**
 * @Description Resets a failed asset status to QUEUED and re-publishes the processing job to RabbitMQ.
 * @Params assetId (string) - Asset UUID identifier
 * @Returns Promise<RequeueAssetResult> - Success result object
 */
export async function requeueFailedAsset(assetId: string): Promise<RequeueAssetResult> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
  });
  if (!asset) {
    throw new Error('Asset not found');
  }
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      status: AssetStatus.QUEUED,
      errorMessage: null,
    },
  });
  const payload = {
    assetId: asset.id,
    rawPath: asset.rawPath,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
  };
  await publishProcessingJob(payload);
  return { success: true };
}

/**
 * @Description Deletes a failed asset's raw object from MinIO and deletes its PostgreSQL record.
 * @Params assetId (string) - Asset UUID identifier
 * @Returns Promise<DeleteAssetResult> - Deletion success result object
 */
export async function deleteFailedAssets(assetId: string): Promise<DeleteAssetResult> {
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

/**
 * @Description Queries paginated system audit and error logs from PostgreSQL with filtering by log level, origin, or search query.
 * @Params params (object) - Query options including page, limit, level, origin, search
 * @Returns Promise<object> - Paginated system logs and pagination metadata
 */
export async function getSystemLogs(params: {
  page?: number;
  limit?: number;
  level?: string;
  origin?: string;
  search?: string;
}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (params.level && params.level.trim()) {
    where.level = params.level.trim().toUpperCase();
  }

  if (params.origin && params.origin.trim()) {
    where.origin = params.origin.trim().toUpperCase();
  }

  if (params.search && params.search.trim()) {
    const query = params.search.trim();
    where.OR = [
      { message: { contains: query, mode: 'insensitive' } },
      { correlationId: { contains: query, mode: 'insensitive' } },
      { functionName: { contains: query, mode: 'insensitive' } },
      { url: { contains: query, mode: 'insensitive' } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.systemLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

