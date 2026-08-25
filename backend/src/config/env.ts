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

  // JWT Authentication Settings
  JWT_SECRET: z.string().default('dam_super_secret_jwt_key_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('7d'),

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

export const env = _env.data;
