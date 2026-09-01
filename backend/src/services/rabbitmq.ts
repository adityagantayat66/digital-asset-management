import amqp, { Channel, ChannelModel } from 'amqplib';
import { env } from '../config/env';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export const QUEUE_ASSET_PROCESSING = 'asset_processing';
export const DLX_ASSET_PROCESSING = 'asset_processing_dlx';

/**
 * Connects to RabbitMQ and asserts durable queue topology.
 */
export async function connectRabbitMQ(): Promise<Channel> {
  if (channel) return channel;

  try {
    const conn = await amqp.connect(env.RABBITMQ_URL, { heartbeat: 60 });
    connection = conn;

    conn.on('error', (err) => {
      console.error('❌ RabbitMQ Backend Connection Error:', err.message);
      connection = null;
      channel = null;
    });

    conn.on('close', () => {
      console.warn('⚠️ RabbitMQ Backend Connection Closed.');
      connection = null;
      channel = null;
    });

    const ch = await conn.createChannel();
    channel = ch;

    // 1. Assert Dead Letter Exchange (DLX) for unprocessable failed tasks
    await ch.assertExchange(DLX_ASSET_PROCESSING, 'direct', { durable: true });
    await ch.assertQueue(`${QUEUE_ASSET_PROCESSING}_dead_letters`, { durable: true });
    await ch.bindQueue(`${QUEUE_ASSET_PROCESSING}_dead_letters`, DLX_ASSET_PROCESSING, 'failed');

    // 2. Assert Main Task Queue with Dead Letter routing
    await ch.assertQueue(QUEUE_ASSET_PROCESSING, {
      durable: true, // Messages survive RabbitMQ broker restarts
      arguments: {
        'x-dead-letter-exchange': DLX_ASSET_PROCESSING,
        'x-dead-letter-routing-key': 'failed',
      },
    });

    console.log(`✅ Connected to RabbitMQ Queue: "${QUEUE_ASSET_PROCESSING}"`);
    return ch;
  } catch (error) {
    console.error('❌ RabbitMQ Connection Error:', error);
    throw error;
  }
}

/**
 * Publishes an asset processing job to the RabbitMQ queue.
 */
export async function publishProcessingJob(assetPayload: {
  assetId: string;
  rawPath: string;
  originalName: string;
  mimeType: string;
}): Promise<boolean> {
  const ch = await connectRabbitMQ();
  const messageBuffer = Buffer.from(JSON.stringify(assetPayload));

  return ch.sendToQueue(QUEUE_ASSET_PROCESSING, messageBuffer, {
    persistent: true, // Ensure task message is saved to disk
  });
}
