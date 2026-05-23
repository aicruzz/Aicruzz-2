import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { env } from './config/env';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  try {
    logger.info('🚀 Starting AiCruzz API...');

    // Connect to services
    await connectDatabase();
    await connectRedis();

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`✅ AiCruzz API running on http://localhost:${env.PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
      logger.info(`   Health: http://localhost:${env.PORT}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`\n${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('✅ Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 30s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception:', err);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
