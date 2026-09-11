import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
// Load variables from root .env file into process.env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

// Define a strict schema to validate all environment variables at startup
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),

  // HTTPS & Security Settings
  ENABLE_HTTPS: z.string().transform((val) => val === 'true').default('false'),
  SECURE_FRONTEND_URLS: z
    .string()
    .default('https://localhost:8443,https://127.0.0.1:8443')
    .transform((val) => val.split(',').map((url) => url.trim()).filter(Boolean)),
  LOCAL_FRONTEND_URLS: z
    .string()
    .default('http://localhost:3000,http://localhost:8080,http://127.0.0.1:3000,http://127.0.0.1:8080')
    .transform((val) => val.split(',').map((url) => url.trim()).filter(Boolean)),

  // JWT Authentication Settings
  JWT_SECRET: z.string().default('dam_super_secret_jwt_key_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN_SECONDS: z.string().transform(Number).default('604800'),

  // PostgreSQL Database Connection URL
  DATABASE_URL: z.string().default('postgresql://postgres:root@localhost:5432/dam_db?schema=public'),

  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),

  // RabbitMQ Configuration
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),

  // MinIO S3 Storage Configuration
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.string().transform(Number).default('9000'),
  MINIO_PUBLIC_ENDPOINT: z.string().default('http://localhost:9000'),
  MINIO_ROOT_USER: z.string().default('minioadmin'),
  MINIO_ROOT_PASSWORD: z.string().default('minioadmin'),
  MINIO_RAW_BUCKET: z.string().default('raw-assets'),
  MINIO_PROCESSED_BUCKET: z.string().default('processed-assets'),
});

// Validate process.env against our schema
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment configuration. Please check your .env file.');
}

const parsed = _env.data;

// Combine secure and local (dev-only) origins into a deduplicated list
const activeFrontendUrls = Array.from(
  new Set([
    ...parsed.SECURE_FRONTEND_URLS,
    ...(parsed.NODE_ENV === 'development' ? parsed.LOCAL_FRONTEND_URLS : []),
  ])
);

export const env = {
  ...parsed,
  FRONTEND_URLS: activeFrontendUrls,
};

