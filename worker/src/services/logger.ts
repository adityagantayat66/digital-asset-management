import { ErrorLogPayload, publishErrorLog } from "./rabbitmq";

export class LoggerService {
    public static async logError(logPayload: Omit<ErrorLogPayload, 'timestamp' | 'origin'>): Promise<void> {
        const fullPayload: ErrorLogPayload = {
            ...logPayload,
            timestamp: new Date().toISOString(),
            origin: 'WORKER',
        };
        //  // 1. Log to console for Docker container stdout
        console.error(`❌ [${fullPayload.functionName}] ${fullPayload.message}`);
        // 2. Offload to RabbitMQ asynchronously without awaiting disk write
        publishErrorLog(fullPayload).catch((err) => {
            console.warn('⚠️ Failed to publish error log to RabbitMQ:', err.message);
        });
    }
}
