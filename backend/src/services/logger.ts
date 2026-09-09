import { ErrorLogPayload } from "../utils/models";
import { publishErrorLog } from "./rabbitmq";

export class LoggerService {
    /**
     * @Description Asynchronously dispatches structured system audit and error log events to stdout and RabbitMQ logger queue.
     * @Params logPayload (object) - Partial log payload containing level, functionName, message, details, and stack
     * @Returns Promise<void>
     */
    public static async logError(logPayload: Omit<ErrorLogPayload, 'timestamp' | 'origin'>): Promise<void> {
        const fullPayload: ErrorLogPayload = {
            ...logPayload,
            timestamp: new Date().toISOString(),
            origin: 'API_GATEWAY',
        };
        //  // 1. Log to console for Docker container stdout
        console.error(`❌ [${fullPayload.functionName}] ${fullPayload.message}`);
        // 2. Offload to RabbitMQ asynchronously without awaiting disk write
        publishErrorLog(fullPayload).catch((err) => {
            console.warn('⚠️ Failed to publish error log to RabbitMQ:', err.message);
        });
    }
}
