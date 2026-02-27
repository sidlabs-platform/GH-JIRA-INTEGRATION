import { CosmosClient, type Container } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type { OrgConfig, RepoOverride } from '../../models/org-config';
import { createDefaultOrgConfig } from '../../config/defaults';
import { createLogger } from '../../utils/logger';

const logger = createLogger('config-service');

const CONTAINER_NAME = 'org-configs';

let container: Container;

/** Initialize the Cosmos DB connection. */
export function initConfigService(cosmosEndpoint: string, database: string): void {
  const credential = new DefaultAzureCredential();
  const client = new CosmosClient({ endpoint: cosmosEndpoint, aadCredentials: credential });
  container = client.database(database).container(CONTAINER_NAME);
  logger.info('Config service initialized');
}

/** Get configuration for an organization, creating defaults if not found. */
export async function getOrgConfig(org: string): Promise<OrgConfig> {
  try {
    const { resource } = await container.item(`org-${org}`, 'org-config').read<OrgConfig>();
    if (resource) return resource;
  } catch (error: unknown) {
    const cosmosErr = error as { code?: number };
    if (cosmosErr.code !== 404) {
      throw error;
    }
  }

  // Not found — this org has not been configured yet
  logger.warn(`No config found for org '${org}', returning defaults`);
  return createDefaultOrgConfig(org, 0);
}

/** Merge repo-level overrides into the org config. */
export function mergeRepoOverrides(
  orgConfig: OrgConfig,
  repoFullName: string,
): OrgConfig {
  const override: RepoOverride | undefined = orgConfig.repoOverrides[repoFullName];
  if (!override) return orgConfig;

  const merged = { ...orgConfig };

  if (override.jira) {
    merged.jira = { ...merged.jira, ...override.jira };
  }
  if (override.alerts) {
    for (const [type, alertOverride] of Object.entries(override.alerts)) {
      const key = type as keyof typeof merged.alerts;
      if (merged.alerts[key] && alertOverride) {
        merged.alerts[key] = { ...merged.alerts[key], ...alertOverride };
      }
    }
  }

  return merged;
}

/** Create or update an org configuration. */
export async function upsertOrgConfig(config: OrgConfig): Promise<OrgConfig> {
  config.updatedAt = new Date().toISOString();
  const { resource } = await container.items.upsert<OrgConfig>(config);
  logger.info(`Upserted config for org '${config.org}'`);
  return resource!;
}

/** List all org configurations. */
export async function listOrgConfigs(): Promise<OrgConfig[]> {
  const { resources } = await container.items
    .query<OrgConfig>({
      query: 'SELECT * FROM c WHERE c.partitionKey = @pk',
      parameters: [{ name: '@pk', value: 'org-config' }],
    })
    .fetchAll();
  return resources;
}

/** Auto-provision a new org when the app is installed. */
export async function provisionOrg(
  org: string,
  installationId: number,
): Promise<OrgConfig> {
  // Check if already exists
  try {
    const { resource } = await container.item(`org-${org}`, 'org-config').read<OrgConfig>();
    if (resource) {
      // Update installation ID if changed
      if (resource.installationId !== installationId) {
        resource.installationId = installationId;
        return await upsertOrgConfig(resource);
      }
      return resource;
    }
  } catch (error: unknown) {
    const cosmosErr = error as { code?: number };
    if (cosmosErr.code !== 404) throw error;
  }

  // Create new
  const newConfig = createDefaultOrgConfig(org, installationId);
  return await upsertOrgConfig(newConfig);
}
