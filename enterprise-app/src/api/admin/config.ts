import { Router, type Request, type Response } from 'express';
import {
  getOrgConfig,
  upsertOrgConfig,
  listOrgConfigs,
} from '../../services/config/config-service';
import { createLogger } from '../../utils/logger';

const logger = createLogger('admin-config-api');

export function createConfigRouter(): Router {
  const router = Router();

  /** List all org configurations. */
  router.get('/orgs', async (_req: Request, res: Response) => {
    try {
      const configs = await listOrgConfigs();
      res.json({ count: configs.length, configs });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to list org configs: ${msg}`);
      res.status(500).json({ error: 'Failed to list configurations' });
    }
  });

  /** Get configuration for a specific org. */
  router.get('/orgs/:org', async (req: Request, res: Response) => {
    try {
      const config = await getOrgConfig(req.params.org);
      res.json(config);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get org config: ${msg}`);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  /** Create or update configuration for an org. */
  router.put('/orgs/:org', async (req: Request, res: Response) => {
    try {
      const orgName = req.params.org;
      const existing = await getOrgConfig(orgName);

      // Merge incoming fields with existing config
      const updated = {
        ...existing,
        ...req.body,
        id: `org-${orgName}`,
        partitionKey: 'org-config' as const,
        org: orgName,
      };

      const result = await upsertOrgConfig(updated);
      logger.info(`Updated config for org '${orgName}'`);
      res.json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to update org config: ${msg}`);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  return router;
}
