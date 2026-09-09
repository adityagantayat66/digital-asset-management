import { ErrorLogPayload, publishErrorLog } from "./rabbitmq";

export class LoggerService {
    /**
     * @Description Asynchronously dispatches structured error logs from background worker to stdout and RabbitMQ logger queue.
     * @Params logPayload (object) - Partial log payload containing level, functionName, message, details, and stack
     * @Returns Promise<void>
     */
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
