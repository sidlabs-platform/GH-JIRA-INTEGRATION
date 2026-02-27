import { Router, type Request, type Response } from 'express';
import { verifyWebhookSignature } from './signature';
import { enqueueAlert } from '../../services/queue/queue-service';
import { provisionOrg } from '../../services/config/config-service';
import { sanitizeSeverity } from '../../utils/sanitization';
import { createLogger } from '../../utils/logger';
import type { AlertMessage } from '../../models/alert';

const logger = createLogger('webhook-receiver');

const SUPPORTED_EVENTS = new Set([
  'code_scanning_alert',
  'secret_scanning_alert',
  'dependabot_alert',
  'installation',
  'installation_repositories',
]);

const ALERT_EVENTS = new Set([
  'code_scanning_alert',
  'secret_scanning_alert',
  'dependabot_alert',
]);

const ALERT_ACTIONS = new Set(['created', 'reopened']);

function extractSeverity(event: string, payload: Record<string, unknown>): string {
  const alert = payload.alert as Record<string, unknown> | undefined;
  if (!alert) return 'medium';

  switch (event) {
    case 'code_scanning_alert': {
      const rule = alert.rule as Record<string, unknown> | undefined;
      return sanitizeSeverity(
        (rule?.security_severity_level as string) || (rule?.severity as string),
      );
    }
    case 'secret_scanning_alert':
      return 'critical';
    case 'dependabot_alert': {
      const advisory = alert.security_advisory as Record<string, unknown> | undefined;
      return sanitizeSeverity(advisory?.severity as string);
    }
    default:
      return 'medium';
  }
}

export function createWebhookRouter(webhookSecret: string): Router {
  const router = Router();

  router.post('/github', async (req: Request, res: Response) => {
    const correlationId = (req.headers['x-github-delivery'] as string) || '';
    const event = req.headers['x-github-event'] as string;
    const signatureHeader = req.headers['x-hub-signature-256'] as string;

    // 1. Verify signature
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
      logger.warn('Webhook signature verification failed', { correlationId });
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // 2. Check event type
    if (!event || !SUPPORTED_EVENTS.has(event)) {
      res.status(200).json({ message: 'Event not relevant' });
      return;
    }

    const payload = req.body;
    const action = payload.action as string;
    const org = payload.organization?.login || payload.installation?.account?.login || '';

    logger.info(`Received ${event} event`, {
      correlationId,
      org,
      data: { action, event },
    });

    // 3. Handle installation events (auto-provision org)
    if (event === 'installation' && (action === 'created' || action === 'new_permissions_accepted')) {
      const installationId = payload.installation?.id;
      if (org && installationId) {
        try {
          await provisionOrg(org, installationId);
          logger.info(`Auto-provisioned org: ${org}`, { org });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to provision org ${org}: ${msg}`, { org });
        }
      }
      res.status(200).json({ message: 'Installation processed' });
      return;
    }

    if (event === 'installation_repositories') {
      res.status(200).json({ message: 'Repository change noted' });
      return;
    }

    // 4. Filter to relevant alert actions
    if (!ALERT_EVENTS.has(event) || !ALERT_ACTIONS.has(action)) {
      res.status(200).json({ message: 'Action not relevant' });
      return;
    }

    // 5. Enqueue for async processing
    const repoFullName = payload.repository?.full_name || '';
    const severity = extractSeverity(event, payload);

    const message: AlertMessage = {
      event,
      action,
      payload: {
        alert: payload.alert,
        repository: payload.repository,
        organization: payload.organization,
        installation: payload.installation,
        sender: payload.sender,
      },
      receivedAt: new Date().toISOString(),
      deliveryId: correlationId,
      severity,
      org,
      repo: repoFullName,
    };

    try {
      await enqueueAlert(message);
      res.status(202).json({ message: 'Accepted', deliveryId: correlationId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to enqueue alert: ${msg}`, { correlationId, org });
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  return router;
}
