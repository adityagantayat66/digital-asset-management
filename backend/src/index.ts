import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import assetRoutes from './routes/assetRoutes';
import { connectRabbitMQ } from './services/rabbitmq';

const app = express();

// 1. Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

// 2. Parse incoming JSON request bodies
app.use(express.json());

// 3. HTTP Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 4. API Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/assets', assetRoutes);

// 5. System Healthcheck Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
  });
});

// 6. Global Error Handling Middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Global API Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// 7. Start HTTP Server and initialize RabbitMQ topology
async function startServer() {
  try {
    // Attempt RabbitMQ queue assertion on startup
    await connectRabbitMQ().catch((err) => {
      console.warn('⚠️ RabbitMQ initial connection delayed:', err.message);
    });

    app.listen(env.PORT, () => {
      console.log(`🚀 Digital Asset Management API Gateway listening on http://localhost:${env.PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start API Gateway server:', error);
    process.exit(1);
  }
}

startServer();
