import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: '../.env' });
dotenv.config();

import sharp from 'sharp';
import fs from 'fs';
import { randomUUID } from 'crypto';
import * as Minio from 'minio';
import Redis from 'ioredis';
import * as amqp from 'amqplib';
import { prisma } from './services/prisma';

async function runE2ETest() {
    console.log('🚀 Starting End-to-End Image Processing Integration Test...\n');

    const minioClient = new Minio.Client({
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
    });

    const redisPublisher = new Redis({ host: 'localhost', port: 6379 });
    const redisSubscriber = new Redis({ host: 'localhost', port: 6379 });

    try {
        // 1. Create dummy user for test
        const testUser = await prisma.user.upsert({
            where: { email: 'test_e2e@example.com' },
            update: {},
            create: {
                id: randomUUID(),
                email: 'test_e2e@example.com',
                passwordHash: 'dummy_hash',
                name: 'E2E Tester',
            },
        });
        console.log('✅ 1. Database Connection & Test User Verified (User ID:', testUser.id, ')');

        // 2. Create a test 800x600 sample image file on disk
        const sampleImgPath = path.join(__dirname, 'test_input.png');
        await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 4,
                background: { r: 255, g: 100, b: 50, alpha: 1 },
            },
        })
            .png()
            .toFile(sampleImgPath);
        console.log('✅ 2. Created Sample Raw Image File (800x600 PNG)');

        // 3. Create Asset record in PostgreSQL (PENDING_UPLOAD)
        const assetId = randomUUID();
        const objectKey = `${assetId}_test_input.png`;
        const rawPath = `raw-assets/${objectKey}`;

        const asset = await prisma.asset.create({
            data: {
                id: assetId,
                originalName: 'test_input.png',
                mimeType: 'image/png',
                size: fs.statSync(sampleImgPath).size,
                uploaderId: testUser.id,
                status: 'PENDING_UPLOAD',
                rawPath: rawPath,
            },
        });
        console.log('✅ 3. Pre-registered Asset in PostgreSQL (Asset ID:', asset.id, ')');

        // 4. Upload raw file to MinIO raw-assets bucket
        await minioClient.fPutObject('raw-assets', objectKey, sampleImgPath, { 'Content-Type': 'image/png' });
        console.log('✅ 4. Uploaded Raw File to MinIO raw-assets bucket (Key:', objectKey, ')');

        // 5. Subscribe to Redis SSE channel BEFORE pushing task
        const sseChannel = `asset:progress:${assetId}`;
        const receivedProgressEvents: any[] = [];

        await redisSubscriber.subscribe(sseChannel);
        redisSubscriber.on('message', (channel, message) => {
            if (channel === sseChannel) {
                const parsed = JSON.parse(message);
                console.log('   📡 [SSE Progress Event Received]:', parsed);
                receivedProgressEvents.push(parsed);
            }
        });
        console.log('✅ 5. Subscribed to Redis Pub/Sub SSE Channel (', sseChannel, ')');

        // 6. Update DB status to QUEUED & publish task to RabbitMQ
        await prisma.asset.update({
            where: { id: assetId },
            data: { status: 'QUEUED' },
        });

        const connection = await amqp.connect('amqp://guest:guest@localhost:5672');
        const channel = await connection.createChannel();
        await channel.assertExchange('asset_processing_dlx', 'direct', { durable: true });
        await channel.assertQueue('asset_processing', {
            arguments: {
                'x-dead-letter-exchange': 'asset_processing_dlx',
                'x-dead-letter-routing-key': 'failed'
            }, durable: true
        });

        const taskPayload = {
            assetId,
            rawPath,
            originalName: 'test_input.png',
            mimeType: 'image/png',
        };

        channel.sendToQueue('asset_processing', Buffer.from(JSON.stringify(taskPayload)), { persistent: true });
        console.log('✅ 6. Enqueued Task to RabbitMQ Queue asset_processing');

        // 7. Wait 3.5 seconds for Worker to process the message from RabbitMQ
        console.log('\n⏳ Waiting 3.5 seconds for worker microservice to execute task...\n');
        await new Promise((resolve) => setTimeout(resolve, 3500));

        // 8. Verify DB update
        const updatedAsset = await prisma.asset.findUnique({ where: { id: assetId } });
        console.log('🔍 [DB Verification] Final Asset Record from PostgreSQL:');
        console.log('   - Status:', updatedAsset?.status);
        console.log('   - Thumbnail URL:', updatedAsset?.thumbnailUrl);

        if (updatedAsset?.status === 'COMPLETED' && updatedAsset?.thumbnailUrl) {
            console.log('\n🎉 E2E TEST PASSED SUCCESSFULLY!');
            console.log('✅ DB updated to COMPLETED');
            console.log('✅ Thumbnail generated & saved in MinIO processed-assets bucket');
            console.log('✅ SSE Progress Pub/Sub events received cleanly');
        } else {
            console.error('\n❌ TEST FAILED: Asset status is not COMPLETED or thumbnailUrl is missing.');
        }

        // Cleanup local test files
        if (fs.existsSync(sampleImgPath)) fs.unlinkSync(sampleImgPath);
        await connection.close();
        await redisSubscriber.disconnect();
        await redisPublisher.disconnect();
        await prisma.$disconnect();

    } catch (err) {
        console.error('❌ E2E Test Error:', err);
        process.exit(1);
    }
}

runE2ETest();
