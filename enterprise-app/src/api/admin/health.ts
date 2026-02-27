import { Router, type Request, type Response } from 'express';

const startTime = Date.now();

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  return router;
}
