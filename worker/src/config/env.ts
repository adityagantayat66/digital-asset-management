import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().default('postgresql://postgres:root@localhost:5432/dam_db?schema=public'),
    RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
    MINIO_ENDPOINT: z.string().default('localhost'),
    MINIO_PORT: z.string().transform(Number).default('9000'),
    MINIO_ROOT_USER: z.string().default('minioadmin'),
    MINIO_ROOT_PASSWORD: z.string().default('minioadmin'),
    MINIO_RAW_BUCKET: z.string().default('raw-assets'),
    MINIO_PROCESSED_BUCKET: z.string().default('processed-assets'),
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().transform(Number).default('6379'),
    WORKER_CONCURRENCY: z.coerce.number().default(2),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error('❌ Invalid environment variables:', parsedEnv.error.issues);
    process.exit(1);
}

export const env = parsedEnv.data;
