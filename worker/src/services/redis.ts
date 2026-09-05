import Redis from 'ioredis';
import { env } from '../config/env';
import { LoggerService } from './logger';

export const redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: 3,
});
redisClient.on('connect', () => {
    console.log('✅ Connected to Redis Store');
});

redisClient.on('error', (err) => {
    LoggerService.logError({
        level: 'CRITICAL',
        functionName: 'Worker:Redis',
        message: typeof err === 'string' ? err : (err?.message || 'Redis Connection Error'),
        stack: err?.stack,
        details: {},
    });
    console.error('❌ Redis Connection Error:', err);
});

export const redisPublisher = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: null,
});

redisPublisher.on('error', (err) => {
    console.error('❌ Worker Redis Publisher Error:', err);
});

export interface JobProgressPayload {
    assetId: string;
    progress: number; // 0 to 100
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    stage?: string;
    error?: string;
}

/**
 * Publishes real-time transcoding progress to Redis Pub/Sub channel
 * AND updates Redis Hash state `job:{id}:progress` for UI progress bar queries.
 */
export async function publishJobProgress(payload: JobProgressPayload): Promise<void> {
    const channel = `asset:progress:${payload.assetId}`;
    const hashKey = `job:${payload.assetId}:progress`;

    const message = JSON.stringify({
        ...payload,
        updatedAt: new Date().toISOString(),
    });

    // 1. Update Hash state in Redis RAM
    await redisPublisher.hset(hashKey, {
        progress: payload.progress.toString(),
        status: payload.status,
        stage: payload.stage || '',
        error: payload.error || '',
        updatedAt: new Date().toISOString(),
    });

    // 2. Publish to Pub/Sub channel for live Server-Sent Events (SSE)
    await redisPublisher.publish(channel, message);
}