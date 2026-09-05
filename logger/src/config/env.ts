import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from root .env file if available, then fallback to local .env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  QUEUE_LOGGER: z.string().default('dam_system_logger'),
  LOG_DIR: z.string().default('Error-Logs'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables in logger service:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
