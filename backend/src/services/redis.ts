import { Redis } from 'ioredis';
import { env } from '../config/env';

// 1. Primary Redis Client for Caching, Analytics Counters, and Distributed Locks
export const redisClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: 3,
});

// 2. Dedicated Subscriber Redis Client for Server-Sent Events (SSE) Pub/Sub
// Note: In Redis, a connection in Subscriber mode cannot run standard GET/SET commands,
// so maintaining a dedicated client instance for SSE streaming is required.
export const redisSubscriber = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: 3,
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis Store');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err);
});
