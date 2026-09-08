import amqp, { Channel, ChannelModel } from 'amqplib';
import { env } from '../config/env';
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
    origin: string;
}


let connection: ChannelModel | null = null;
let channel: Channel | null = null;
export const QUEUE_LOGGER = 'dam_system_logger';
export const DLX_LOGGER = 'dam_system_logger_dlx';
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
            console.error('❌ RabbitMQ Worker Connection Error:', err.message);
            connection = null;
            channel = null;
        });

        conn.on('close', () => {
            console.warn('⚠️ RabbitMQ Worker Connection Closed.');
            connection = null;
            channel = null;
        });

        const ch = await conn.createChannel();
        await ch.assertExchange(DLX_ASSET_PROCESSING, 'direct', { durable: true });
        await ch.assertQueue(QUEUE_ASSET_PROCESSING, {
            arguments: {
                'x-dead-letter-exchange': DLX_ASSET_PROCESSING,
                'x-dead-letter-routing-key': 'failed'
            }, durable: true
        });
        // Assert logger queue topology once on channel creation
        await ch.assertExchange(DLX_LOGGER, 'direct', { durable: true });
        await ch.assertQueue(`${QUEUE_LOGGER}_dead_letters`, { durable: true });
        await ch.assertQueue(QUEUE_LOGGER, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': DLX_LOGGER,
                'x-dead-letter-routing-key': 'failed',
            },
        });

        channel = ch;
        return ch;
    } catch (error) {
        console.error('❌ Failed to connect to RabbitMQ:', error);
        throw error;
    }
}

/**
 * Publishes error log to RabbitMQ.
 */
export async function publishErrorLog(logPayload: ErrorLogPayload): Promise<void> {
    if (!channel) {
        try {
            await connectRabbitMQ();
        } catch (error) {
            console.error('⚠️ Failed to connect to RabbitMQ for publishing log:', error);
            return;
        }
    }
    try {
        channel!.sendToQueue(
            QUEUE_LOGGER,
            Buffer.from(JSON.stringify(logPayload)),
            { persistent: true }
        );
    } catch (error) {
        console.error('❌ Failed to publish error log:', error);
    }
}