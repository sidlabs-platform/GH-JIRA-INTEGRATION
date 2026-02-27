import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../../utils/logger';

const logger = createLogger('error-handler');

/** Global Express error handler. */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(`Unhandled error: ${err.message}`, {
    data: { stack: err.stack },
  });

  res.status(500).json({
    error: 'Internal server error',
  });
}
