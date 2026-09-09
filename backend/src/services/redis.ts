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
 * @Description Saves a refresh token string mapped to user session payload with TTL in Redis.
 * @Params refreshToken (string) - Opaque refresh token string
 *         payload (RefreshTokenPayload) - User session payload object
 *         ttlSeconds (number) - Time-to-live expiration in seconds (default: env setting)
 * @Returns Promise<void>
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
 * @Description Fetches the user session payload associated with a refresh token from Redis.
 * @Params refreshToken (string) - Opaque refresh token string
 * @Returns Promise<RefreshTokenPayload | null> - User session payload or null if expired/invalid
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
 * @Description Removes a refresh token from Redis upon logout or token rotation.
 * @Params refreshToken (string) - Opaque refresh token string to revoke
 * @Returns Promise<void>
 */
export async function deleteRefreshToken(refreshToken: string): Promise<void> {
  const key = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  await redisClient.del(key);
}
