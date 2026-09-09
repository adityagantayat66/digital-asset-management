import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { ErrorLogPayload } from '..';
import { env } from '../config/env';

const LOG_DIR = path.resolve(process.cwd(), env.LOG_DIR);

// In-memory queue to guarantee sequential thread-safe file appends
let isWriting = false;
const writeQueue: string[] = [];

/**
 * @Description Processes incoming error log payload by logging to stdout, persisting to PostgreSQL, and queuing disk append.
 * @Params payload (ErrorLogPayload) - System error log entry payload
 * @Returns Promise<void>
 */
export async function processLogEntry(payload: ErrorLogPayload): Promise<void> {
  // 1. Output structured JSON line to container stdout (12-Factor App)
  console.log(JSON.stringify({
    timestamp: payload.timestamp,
    level: payload.level,
    origin: payload.origin || 'SYSTEM',
    functionName: payload.functionName,
    message: payload.message,
    correlationId: payload.correlationId,
    statusCode: payload.statusCode,
    code: payload.code,
  }));

  // 2. Persist to PostgreSQL database for Admin UI indexing and search
  try {
    await prisma.systemLog.create({
      data: {
        timestamp: new Date(payload.timestamp),
        level: payload.level,
        origin: payload.origin || 'SYSTEM',
        functionName: payload.functionName,
        message: payload.message,
        code: payload.code,
        statusCode: payload.statusCode,
        correlationId: payload.correlationId,
        method: payload.requestContext?.method,
        url: payload.requestContext?.url,
        userId: payload.requestContext?.userId,
        ip: payload.requestContext?.ip,
        details: payload.details ? JSON.parse(JSON.stringify(payload.details)) : undefined,
        stack: payload.stack,
      },
    });
  } catch (dbErr) {
    console.error('⚠️ DB Log Write Warning:', dbErr instanceof Error ? dbErr.message : dbErr);
  }

  // 3. Queue line append for thread-safe daily .jsonl file backup
  const jsonLine = JSON.stringify(payload) + '\n';
  writeQueue.push(jsonLine);
  flushWriteQueue().catch((err) => console.error('❌ File Log Write Error:', err));
}

/**
 * @Description Sequentially flushes in-memory log lines queue to daily JSONL disk file.
 * @Returns Promise<void>
 */
async function flushWriteQueue(): Promise<void> {
  if (isWriting || writeQueue.length === 0) return;
  isWriting = true;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const filePath = path.join(LOG_DIR, `error_log_${dateStr}.jsonl`);

    while (writeQueue.length > 0) {
      const line = writeQueue.shift();
      if (line) {
        await fs.promises.appendFile(filePath, line, 'utf8');
      }
    }
  } catch (error) {
    console.error('❌ Failed appending log to .jsonl file:', error);
  } finally {
    isWriting = false;
  }
}
