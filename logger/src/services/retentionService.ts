import fs from 'fs';
import path from 'path';
import { prisma } from './prisma';
import { env } from '../config/env';

const RETENTION_DAYS = 10;
const LOG_DIR = path.resolve(process.cwd(), env.LOG_DIR);

export async function runRetentionCleanup(): Promise<void> {
  console.log(`🧹 Running automated ${RETENTION_DAYS}-day log retention cleanup...`);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  // 1. Purge PostgreSQL system_logs table entries older than RETENTION_DAYS
  try {
    const deleted = await prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });
    console.log(`🗑️ Purged ${deleted.count} old system log entries from PostgreSQL database.`);
  } catch (err) {
    console.error('⚠️ DB Retention Cleanup Error:', err instanceof Error ? err.message : err);
  }

  // 2. Delete .jsonl and .html log files on disk older than RETENTION_DAYS
  try {
    if (fs.existsSync(LOG_DIR)) {
      const files = await fs.promises.readdir(LOG_DIR);
      for (const file of files) {
        const filePath = path.join(LOG_DIR, file);
        const stats = await fs.promises.stat(filePath);
        if (stats.mtime < cutoffDate) {
          await fs.promises.unlink(filePath);
          console.log(`🗑️ Deleted expired log file: ${file}`);
        }
      }
    }
  } catch (err) {
    console.error('⚠️ File Retention Cleanup Error:', err instanceof Error ? err.message : err);
  }
}

export function startRetentionSchedule(): void {
  // Run immediately on container startup
  runRetentionCleanup().catch((err) => console.error('❌ Initial retention cleanup failed:', err));

  // Schedule to run every 24 hours (86,400,000 ms)
  setInterval(() => {
    runRetentionCleanup().catch((err) => console.error('❌ Scheduled retention cleanup failed:', err));
  }, 24 * 60 * 60 * 1000);
}
