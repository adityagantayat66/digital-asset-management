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

export interface RefreshTokenPayload {
  userId: string;
  email: string;
  role: string;
}

const REFRESH_TOKEN_PREFIX = 'refresh_token:';

/**
 * Saves a refresh token string mapped to user payload with TTL in Redis.
 */
export async function saveRefreshToken(
  refreshToken: string,
  payload: RefreshTokenPayload,
  ttlSeconds: number = env.REFRESH_TOKEN_EXPIRES_IN_SECONDS
): Promise<void> {
  const key = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  await redisClient.setex(key, ttlSeconds, JSON.stringify(payload));
}

/**
 * Fetches the user payload associated with a refresh token from Redis.
 */
export async function getRefreshTokenPayload(refreshToken: string): Promise<RefreshTokenPayload | null> {
  const key = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  const data = await redisClient.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Removes a refresh token from Redis (revocation / logout).
 */
export async function deleteRefreshToken(refreshToken: string): Promise<void> {
  const key = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  await redisClient.del(key);
}
