import express from 'express';
import helmet from 'helmet';
import { loadAppConfig } from './config/app-config';
import { createWebhookRouter } from './api/webhooks/github';
import { createHealthRouter } from './api/admin/health';
import { createConfigRouter } from './api/admin/config';
import { errorHandler } from './api/middleware/error-handler';
import { webhookRateLimiter, adminRateLimiter } from './api/middleware/rate-limit';
import { initConfigService } from './services/config/config-service';
import { initQueueService } from './services/queue/queue-service';
import { initSecretsService } from './services/secrets/secrets-service';
import { startWorkers } from './workers/alert-processor';
import { createLogger, setLogLevel, type LogLevel } from './utils/logger';

const logger = createLogger('app');

async function main(): Promise<void> {
  // Load configuration
  const config = loadAppConfig();
  setLogLevel(config.logLevel as LogLevel);

  logger.info('Starting Enterprise Security-to-Jira App', {
    data: { nodeEnv: config.nodeEnv, port: config.port },
  });

  // Initialize Application Insights (if configured)
  if (config.appInsightsConnectionString) {
    const appInsights = await import('applicationinsights');
    appInsights.setup(config.appInsightsConnectionString)
      .setAutoCollectRequests(true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .start();
    logger.info('Application Insights initialized');
  }

  // Initialize services
  initConfigService(config.azure.cosmosEndpoint, config.azure.cosmosDatabase);
  initQueueService(config.azure.serviceBusNamespace);
  initSecretsService(config.azure.keyVaultUrl);

  // Create Express app
  const app = express();

  // Security middleware
  app.use(helmet());

  // Webhook endpoint needs raw body for signature verification
  app.use(
    '/api/webhooks',
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );

  // JSON parsing for other routes
  app.use('/api/admin', express.json({ limit: '1mb' }));

  // Routes
  app.use('/health', createHealthRouter());
  app.use('/api/webhooks', webhookRateLimiter, createWebhookRouter(config.github.webhookSecret));
  app.use('/api/admin/config', adminRateLimiter, createConfigRouter());

  // Error handler
  app.use(errorHandler);

  // Start queue workers
  startWorkers({
    appId: config.github.appId,
    privateKey: config.github.privateKey,
  });

  // Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    server.close();
    const { closeQueueService } = await import('./services/queue/queue-service');
    await closeQueueService();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`, { data: { stack: err.stack } });
  process.exit(1);
});
