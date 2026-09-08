import z from 'zod';
import { env } from './config/env';
import * as amqp from 'amqplib';
import { processLogEntry } from './services/writeLogStream';
import { startRetentionSchedule } from './services/retentionService';

const QUEUE_LOGGER = 'dam_system_logger';
const DLX_LOGGER = 'dam_system_logger_dlx';
const DLQ_LOGGER = `${QUEUE_LOGGER}_dead_letters`;

export interface ErrorLogPayload {
  timestamp: string;
  level: 'ERROR' | 'CRITICAL' | 'WARN';
  functionName: string;
  message: string;
  code?: string;
  statusCode?: number;
  correlationId?: string;
  requestContext?: {
    method: string;
    url: string;
    userId?: string;
    ip?: string;
  };
  details?: any;
  stack?: string;
  origin?: string;
}

const JobPayloadSchema = z.object({
  timestamp: z.string(),
  level: z.enum(['ERROR', 'CRITICAL', 'WARN']),
  functionName: z.string(),
  message: z.string(),
  code: z.string().optional(),
  statusCode: z.number().optional(),
  correlationId: z.string().optional(),
  requestContext: z.object({
    method: z.string(),
    url: z.string(),
    userId: z.string().optional(),
    ip: z.string().optional(),
  }).optional(),
  details: z.any().optional(),
  stack: z.string().optional(),
  origin: z.string().optional(),
});

let amqpConnection: amqp.ChannelModel | null = null;
let amqpChannel: amqp.Channel | null = null;

async function startLoggerService(): Promise<void> {
  try {
    console.log(`🚀 DAM System Logger Microservice starting in [${env.NODE_ENV}] mode...`);
    console.log(`📡 Listening on RabbitMQ Queue: "${QUEUE_LOGGER}"`);
    console.log(`📁 Saving error logs to directory: "${env.LOG_DIR}"`);

    // Start 10-day retention schedule
    startRetentionSchedule();

    const connection = await amqp.connect(env.RABBITMQ_URL!, { heartbeat: 60 });
    amqpConnection = connection;

    connection.on('error', (err) => {
      console.error('❌ RabbitMQ Connection Error:', err.message);
    });

    connection.on('close', () => {
      console.warn('⚠️ RabbitMQ connection closed. Attempting reconnect in 5 seconds...');
      setTimeout(() => {
        startLoggerService().catch((err) => console.error('❌ Reconnect failed:', err));
      }, 5000);
    });

    const channel = await connection.createChannel();
    amqpChannel = channel;

    await channel.assertExchange(DLX_LOGGER, 'direct', { durable: true });
    await channel.assertQueue(DLQ_LOGGER, { durable: true });
    await channel.bindQueue(DLQ_LOGGER, DLX_LOGGER, 'failed');
    await channel.assertQueue(QUEUE_LOGGER, {
      arguments: {
        'x-dead-letter-exchange': DLX_LOGGER,
        'x-dead-letter-routing-key': 'failed',
      },
      durable: true,
    });

    await channel.prefetch(1);

    channel.consume(QUEUE_LOGGER, async (msg) => {
      if (!msg) return;

      try {
        const rawContent = msg.content.toString();
        const parsedJson = JSON.parse(rawContent);
        const result = JobPayloadSchema.safeParse(parsedJson);

        if (!result.success) {
          console.error('❌ Failed to parse job payload:', result.error);
          channel.nack(msg, false, false); // Sends message to DLQ
          return;
        }

        await processLogEntry(result.data);
        channel.ack(msg);
      } catch (error) {
        console.error('❌ Failed processing error log entry:', error);
        channel.nack(msg, false, false);
      }
    });
  } catch (error) {
    console.error('❌ Logger service initialization failed:', error);
  }
}

// Graceful Shutdown Handling
const handleShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down DAM Logger Microservice gracefully...`);
  try {
    if (amqpChannel) await amqpChannel.close();
    if (amqpConnection) await amqpConnection.close();
    console.log('✅ Closed RabbitMQ connections.');
  } catch (err) {
    console.error('⚠️ Error during connection closure:', err);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

startLoggerService();
