import type { AxiosInstance } from 'axios';
import type { NormalizedAlert } from '../../models/alert';
import { escapeJql } from '../../utils/sanitization';
import { createLogger } from '../../utils/logger';

const logger = createLogger('jira-dedup');

/**
 * Check if a Jira issue already exists for this alert using label-based dedup.
 * Returns the existing issue key if found, or null.
 */
export async function checkForDuplicate(
  jiraClient: AxiosInstance,
  alert: NormalizedAlert,
  repoName: string,
  securityLabel: string,
): Promise<string | null> {
  const dedupLabel = `gh-alert-${repoName}-${alert._type}-${alert.number}`;

  try {
    const jql = `labels = "${escapeJql(dedupLabel)}" AND labels = "${escapeJql(securityLabel)}"`;
    const response = await jiraClient.get('/rest/api/3/search', {
      params: { jql, maxResults: 1, fields: 'key' },
    });

    if (response.data.total > 0) {
      const existingKey = response.data.issues[0].key;
      logger.info(`Duplicate found: ${existingKey} for alert #${alert.number}`);
      return existingKey;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Duplicate check failed: ${msg}`);
  }

  return null;
}
