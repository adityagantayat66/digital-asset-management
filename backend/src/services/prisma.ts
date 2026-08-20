import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// Singleton Pattern: Creates a single PrismaClient instance shared across the app.
// This prevents memory leaks and ensures we don't exceed PostgreSQL connection limits.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
