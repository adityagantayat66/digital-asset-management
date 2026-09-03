import cron from 'node-cron';
import os from 'os';
import { prisma } from './prisma';
import { redisClient } from './redis';
import { deleteRawAsset } from './minio';

const CRON_LOCK_KEY = 'lock:cron:stale_cleanup';
const CRON_LAST_EXECUTED_KEY = 'cron:last_executed';
const LOCK_TTL_SECONDS = 3600; // 1 hour TTL for distributed lock

/**
 * 24-Hour Stale Upload Cleanup Task
 * Deletes PENDING_UPLOAD records and any raw MinIO data if status has been pending for over 6 hours.
 * Uses a Redis Distributed Lock (SET NX EX) to prevent duplicate execution across scaled worker instances.
 */
export async function cleanupStaleUploads(): Promise<void> {
  try {
    // 1. Acquire Redis Distributed Lock (SET lock:cron:stale_cleanup true NX EX 3600)
    const acquiredLock = await redisClient.set(CRON_LOCK_KEY, 'true', 'EX', LOCK_TTL_SECONDS, 'NX' as any);
    if (!acquiredLock) {
      console.log('🔒 [Cron Job] Another worker instance holds the cleanup lock. Skipping execution.');
      return;
    }

    console.log('🧹 [Cron Job] Starting 24-hour stale PENDING_UPLOAD asset cleanup task...');

    // 2. Calculate cut-off timestamp (6 hours ago)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    // 3. Find stale PENDING_UPLOAD assets in PostgreSQL
    const staleAssets = await prisma.asset.findMany({
      where: {
        status: 'PENDING_UPLOAD',
        createdAt: {
          lte: sixHoursAgo,
        },
      },
    });

    let deletedCount = 0;
    if (staleAssets.length > 0) {
      console.log(`🔍 [Cron Job] Found ${staleAssets.length} stale asset(s) to clean up.`);

      // 4. Delete files from MinIO and records from PostgreSQL
      for (const asset of staleAssets) {
        try {
          if (asset.rawPath) {
            await deleteRawAsset(asset.rawPath);
          }
          await prisma.asset.delete({
            where: { id: asset.id },
          });
          deletedCount++;
          console.log(`  - Cleaned up stale asset ${asset.id} ("${asset.originalName}")`);
        } catch (err: any) {
          console.error(`❌ [Cron Job] Failed to clean up stale asset ${asset.id}:`, err.message);
        }
      }
    } else {
      console.log('✅ [Cron Job] No stale pending uploads older than 6 hours found.');
    }

    // 5. Store execution telemetry in Redis for API Gateway & Frontend Telemetry Card
    const cronTelemetry = {
      timestamp: new Date().toISOString(),
      deletedCount,
      message: deletedCount > 0 
        ? `Successfully cleaned up ${deletedCount} stale PENDING_UPLOAD asset(s) older than 6 hours.`
        : `Ran 24-hour cleanup cycle. 0 stale pending uploads found.`,
      executedBy: `worker:${os.hostname()}:${process.pid}`,
    };

    await redisClient.set(CRON_LAST_EXECUTED_KEY, JSON.stringify(cronTelemetry));
    console.log('✨ [Cron Job] Telemetry recorded in Redis:', cronTelemetry.message);
  } catch (error: any) {
    console.error('❌ [Cron Job] Stale upload cleanup failed:', error.message || error);
  }
}

/**
 * Initializes cron jobs for the worker service.
 */
export function initCronJobs(): void {
  // Schedule cleanup task to run every 24 hours (daily at midnight: 00:00)
  cron.schedule('0 0 * * *', async () => {
    console.log('⏰ [Cron Job Triggered] Running daily scheduled cleanup...');
    await cleanupStaleUploads();
  });

  console.log('📅 [Cron Service Initialized] Scheduled 24-hour stale upload cleanup job (0 0 * * *).');

  // Also run an initial check on worker startup
  cleanupStaleUploads().catch((err) => {
    console.warn('⚠️ [Cron Job] Initial startup cleanup check notice:', err.message);
  });
}
