import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';
import type { JiraCredentials } from '../jira/client';
import { createLogger } from '../../utils/logger';

const logger = createLogger('secrets-service');

let secretClient: SecretClient;

/** Initialize the Key Vault secret client. */
export function initSecretsService(vaultUrl: string): void {
  const credential = new DefaultAzureCredential();
  secretClient = new SecretClient(vaultUrl, credential);
  logger.info('Secrets service initialized');
}

/** Retrieve Jira credentials for an org from Key Vault. */
export async function getJiraCredentials(credentialRef: string): Promise<JiraCredentials> {
  const secret = await secretClient.getSecret(credentialRef);
  if (!secret.value) {
    throw new Error(`Secret '${credentialRef}' has no value`);
  }

  const parsed = JSON.parse(secret.value) as JiraCredentials;
  if (!parsed.userEmail || !parsed.apiToken) {
    throw new Error(`Secret '${credentialRef}' is missing required fields (userEmail, apiToken)`);
  }

  return parsed;
}

/** Retrieve a notification webhook URL from Key Vault. */
export async function getWebhookUrl(secretName: string): Promise<string> {
  if (!secretName) return '';
  try {
    const secret = await secretClient.getSecret(secretName);
    return secret.value || '';
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not retrieve webhook secret '${secretName}': ${msg}`);
    return '';
  }
}
