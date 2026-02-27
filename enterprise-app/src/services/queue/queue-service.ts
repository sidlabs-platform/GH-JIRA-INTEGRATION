import { ServiceBusClient, type ServiceBusSender, type ServiceBusReceiver } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import type { AlertMessage } from '../../models/alert';
import { createLogger } from '../../utils/logger';

const logger = createLogger('queue-service');

// Queue names by severity
const QUEUE_MAP: Record<string, string> = {
  critical: 'alerts-critical',
  high: 'alerts-high',
  medium: 'alerts-medium',
  low: 'alerts-low',
};

const DEFAULT_QUEUE = 'alerts-medium';

let sbClient: ServiceBusClient;
const senders = new Map<string, ServiceBusSender>();

/** Initialize the Service Bus connection. */
export function initQueueService(namespace: string): void {
  const credential = new DefaultAzureCredential();
  sbClient = new ServiceBusClient(namespace, credential);
  logger.info('Queue service initialized');
}

function getSender(queueName: string): ServiceBusSender {
  let sender = senders.get(queueName);
  if (!sender) {
    sender = sbClient.createSender(queueName);
    senders.set(queueName, sender);
  }
  return sender;
}

/** Enqueue an alert message to the appropriate priority queue. */
export async function enqueueAlert(message: AlertMessage): Promise<void> {
  const queueName = QUEUE_MAP[message.severity] || DEFAULT_QUEUE;
  const sender = getSender(queueName);

  await sender.sendMessages({
    body: message,
    applicationProperties: {
      org: message.org,
      repo: message.repo,
      severity: message.severity,
      eventType: message.event,
    },
    correlationId: message.deliveryId,
  });

  logger.info(`Enqueued alert to ${queueName}`, {
    correlationId: message.deliveryId,
    org: message.org,
    repo: message.repo,
  });
}

/** Create a receiver for a specific queue. */
export function createReceiver(queueName: string): ServiceBusReceiver {
  return sbClient.createReceiver(queueName);
}

/** Get all queue names for processing. */
export function getQueueNames(): string[] {
  return Object.values(QUEUE_MAP);
}

/** Close all connections gracefully. */
export async function closeQueueService(): Promise<void> {
  for (const sender of senders.values()) {
    await sender.close();
  }
  senders.clear();
  if (sbClient) {
    await sbClient.close();
  }
  logger.info('Queue service closed');
}
