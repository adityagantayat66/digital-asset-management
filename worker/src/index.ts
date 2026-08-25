import * as amqp from 'amqplib';
import * as fs from 'fs';
import z from 'zod';
import path from 'path';
import { env } from './config/env';
import { publishJobProgress } from './services/redis';
import { downloadRawAssets, uploadProcessedAsset } from './services/minio';
import { prisma } from './services/prisma';
import { generateImageThumbnail } from './background-jobs/imageProcessor';

const QUEUE_ASSET_PROCESSING = 'asset_processing';
const DLX_ASSET_PROCESSING = 'asset_processing_dlx';
const JobPayloadSchema = z.object({
    assetId: z.string(),
    rawPath: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
})
async function startWorker() {
    try {
        console.log('🚀 DAM Worker Service Initializing...');
        const connection = await amqp.connect(env.RABBITMQ_URL!);
        const channel = await connection.createChannel();
        await channel.assertExchange(DLX_ASSET_PROCESSING, 'direct', { durable: true });
        await channel.assertQueue(QUEUE_ASSET_PROCESSING, {
            arguments: {
                'x-dead-letter-exchange': DLX_ASSET_PROCESSING,
                'x-dead-letter-routing-key': 'failed'
            }, durable: true
        });
        await channel.prefetch(env.WORKER_CONCURRENCY);
        channel.consume(QUEUE_ASSET_PROCESSING, async (msg) => {
            if (!msg) {
                return;
            }
            const result = JobPayloadSchema.safeParse(JSON.parse(msg.content.toString()));
            if (!result.success) {
                console.error('❌ Failed to parse job payload:', result.error);
                channel.nack(msg, false, false);
                return;
            }
            const { assetId, rawPath, originalName, mimeType } = result.data;
            const tempDir = path.join(process.cwd(), 'tmp', assetId);
            const tempFilePath = path.join(tempDir, originalName);
            try {
                const progressMsg = { assetId, progress: 0, status: 'PROCESSING' as const, stage: 'STARTED', error: '' }
                await publishJobProgress(progressMsg)
                await downloadRawAssets(rawPath, tempFilePath)
                if (mimeType.startsWith('image/')) {
                    await publishJobProgress({ ...progressMsg, status: 'PROCESSING', progress: 50 });

                    const { thumbnailPath, metadata } = await generateImageThumbnail(tempFilePath, tempDir);
                    console.log('Thumbnail Generated: ', thumbnailPath);
                    if (!fs.existsSync(thumbnailPath)) {
                        throw new Error('❌ Could not generate thumbnail');
                    }
                    const thumbnailUrl = await uploadProcessedAsset(`thumbnails/${assetId}.jpg`, thumbnailPath);
                    await publishJobProgress({ ...progressMsg, status: 'COMPLETED', progress: 100 });
                    await prisma.asset.update({ where: { id: assetId }, data: { status: 'COMPLETED', thumbnailUrl } })
                }
                else if (mimeType.startsWith('video/')) {
                    // TODO implement video processing
                    // ? transcode video
                    // ? extract thumbnail
                    // ? save to Bucket
                    // ? publish progress to redis
                    // ? update db
                }
                else {
                    throw new Error(`Unsupported asset MIME type: ${mimeType}`);
                }
                channel.ack(msg);
            }
            catch (error: any) {
                console.error(`❌ Processing failed for asset ${assetId}:`, error);
                await publishJobProgress({ assetId, progress: 0, status: 'FAILED', stage: 'FAILED', error: error.message })
                await prisma.asset.update({ where: { id: assetId }, data: { status: 'FAILED' } });
                channel.nack(msg, false, false);
            }
            finally {
                if (fs.existsSync(tempDir)) {
                    await fs.promises.rm(tempDir, { recursive: true, force: true });
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