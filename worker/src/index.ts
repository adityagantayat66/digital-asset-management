import * as amqp from 'amqplib';
import { AssetStatus } from '@prisma/client';
import * as fs from 'fs';
import z from 'zod';
import path from 'path';
import os from 'os';
import { env } from './config/env';
import { publishJobProgress, redisClient } from './services/redis';
import { downloadRawAssets, uploadProcessedAsset } from './services/minio';
import { prisma } from './services/prisma';
import { generateImageThumbnail } from './background-jobs/imageProcessor';
import { processVideo } from './background-jobs/videoProcessor';
import { initCronJobs } from './services/cronService';
import { connectRabbitMQ, QUEUE_ASSET_PROCESSING } from './services/rabbitmq';
import { LoggerService } from './services/logger';

const JobPayloadSchema = z.object({
    assetId: z.string(),
    rawPath: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
})
async function startWorker() {
    try {
        const workerId = `worker:${os.hostname()}:${process.pid}`;

        setInterval(async () => {
            await redisClient.set(`worker:heartbeat:${workerId}`, 'ONLINE', 'EX', 10);
        }, 5000);

        // Initialize scheduled 24-hour cron jobs (with Redis locking for worker scaling)
        initCronJobs();

        console.log('🚀 DAM Worker Service Initializing...');

        const channel = await connectRabbitMQ();

        await channel.prefetch(env.WORKER_CONCURRENCY);
        channel.consume(QUEUE_ASSET_PROCESSING, async (msg) => {
            if (!msg) {
                return;
            }
            const correlationId = (msg.properties.headers && msg.properties.headers['x-correlation-id']) || undefined;
            const result = JobPayloadSchema.safeParse(JSON.parse(msg.content.toString()));
            if (!result.success) {
                console.error('❌ Failed to parse job payload:', result.error);
                LoggerService.logError({
                    level: 'CRITICAL',
                    functionName: 'Worker:Index',
                    message: JSON.stringify(result.error),
                    correlationId,
                    details: result.error,
                });
                channel.nack(msg, false, false);
                return;
            }
            const { assetId, rawPath, originalName, mimeType } = result.data;
            const lockKey = `lock:job:${assetId}`;
            // 1. Attempt atomic lock claim (NX = Only set if Not Exists, EX 300 = Auto-expire after 5 min)
            const acquired = await redisClient.set(lockKey, workerId, 'EX', 300, 'NX');
            if (!acquired) {
                console.warn(`⚠️ Job ${assetId} is already locked by another worker instance. Skipping.`);
                channel.nack(msg, false, false); // Rejects duplicate worker execution
                return;
            }
            const tempDir = path.join(process.cwd(), 'temp', assetId);
            const tempFilePath = path.join(tempDir, originalName);
            try {
                const progressMsg = { assetId, progress: 0, status: AssetStatus.PROCESSING, stage: 'STARTED', error: '' }
                await publishJobProgress(progressMsg)
                await downloadRawAssets(rawPath, tempFilePath)
                if (mimeType.startsWith('image/')) {
                    await publishJobProgress({ ...progressMsg, status: AssetStatus.PROCESSING, progress: 50 });

                    const { thumbnailPath, metadata } = await generateImageThumbnail(tempFilePath, tempDir);
                    console.log('Thumbnail Generated: ', thumbnailPath);
                    if (!fs.existsSync(thumbnailPath)) {
                        throw new Error('❌ Could not generate thumbnail');
                    }
                    const thumbnailUrl = await uploadProcessedAsset(`thumbnails/${assetId}.jpg`, thumbnailPath);
                    console.log(thumbnailUrl)
                    await publishJobProgress({ ...progressMsg, status: AssetStatus.COMPLETED, progress: 100 });
                    await prisma.asset.update({ where: { id: assetId }, data: { status: AssetStatus.COMPLETED, thumbnailUrl } })
                }
                else if (mimeType.startsWith('video/')) {
                    // TODO implement video processing
                    const { thumbnailPath, videoUrls } = await processVideo(tempFilePath, tempDir, assetId);
                    // 2. Upload generated thumbnail to MinIO
                    const thumbnailUrl = await uploadProcessedAsset(`thumbnails/${assetId}.jpg`, thumbnailPath, 'image/jpeg');
                    // 3. Upload transcoded videos to MinIO if present
                    let transcoded1080pUrl: string | null = null;
                    let transcoded720pUrl: string | null = null;
                    let transcodedSdUrl: string | null = null;
                    if (videoUrls['1080p']) {
                        transcoded1080pUrl = await uploadProcessedAsset(`transcoded/1080p/${assetId}.mp4`, videoUrls['1080p'], 'video/mp4');
                    }
                    if (videoUrls['720p']) {
                        transcoded720pUrl = await uploadProcessedAsset(`transcoded/720p/${assetId}.mp4`, videoUrls['720p'], 'video/mp4');
                    }
                    if (videoUrls['sd']) {
                        transcodedSdUrl = await uploadProcessedAsset(`transcoded/sd/${assetId}.mp4`, videoUrls['sd'], 'video/mp4');
                    }
                    // 4. Publish 100% COMPLETED progress event to Redis SSE
                    await publishJobProgress({
                        assetId,
                        progress: 100,
                        status: AssetStatus.COMPLETED,
                        stage: 'COMPLETED',
                        error: ''
                    });
                    // 5. Update PostgreSQL Database Record
                    await prisma.asset.update({
                        where: { id: assetId },
                        data: {
                            status: AssetStatus.COMPLETED,
                            thumbnailUrl,
                            transcodedSdUrl,
                            transcoded720pUrl,
                            transcoded1080pUrl,
                        }
                    });
                }
                else {
                    LoggerService.logError({
                        level: 'CRITICAL',
                        functionName: 'Worker:Index',
                        message: 'Unsupported asset MIME type',
                        details: { assetId },
                    })
                    throw new Error(`Unsupported asset MIME type: ${mimeType}`);
                }
                channel.ack(msg);
            }
            catch (error: any) {
                LoggerService.logError({
                    level: 'CRITICAL',
                    functionName: 'Worker:Index',
                    message: typeof error === 'string' ? error : (error?.message || 'Processing failed'),
                    correlationId,
                    stack: error?.stack,
                    details: { assetId },
                });
                console.error(`❌ Processing failed for asset ${assetId}:`, error);
                await publishJobProgress({ assetId, progress: 0, status: AssetStatus.FAILED, stage: 'FAILED', error: error.message })
                await prisma.asset.update({ where: { id: assetId }, data: { status: AssetStatus.FAILED, errorMessage: error.message || 'Unknown processing error', } });
                channel.nack(msg, false, false);
            } finally {
                // Remove temporary staging directory
                if (tempDir && fs.existsSync(tempDir)) {
                    try {
                        await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
                        console.log(`🧹 Successfully cleaned up temp directory: ${tempDir}`);
                    } catch (cleanupErr: any) {
                        LoggerService.logError({
                            level: 'WARN',
                            functionName: 'Worker:Index',
                            message: typeof cleanupErr === 'string' ? cleanupErr : (cleanupErr?.message || 'Cleanup warning'),
                            stack: cleanupErr?.stack,
                            details: { tempDir },
                        });
                        console.warn(`⚠️ Warning: Could not remove temp dir ${tempDir}:`, cleanupErr);
                    }
                }
            }
            // TODO Update db

        });


    } catch (error) {
        console.error('❌ Failed to start DAM Worker:', error);
        process.exit(1);
    }
}

startWorker()