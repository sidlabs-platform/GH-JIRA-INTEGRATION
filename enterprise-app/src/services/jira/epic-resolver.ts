import type { AxiosInstance } from 'axios';
import { isValidJiraKey } from '../../utils/sanitization';
import { createLogger } from '../../utils/logger';

const logger = createLogger('epic-resolver');

const MAX_TRAVERSAL_DEPTH = 5;

/**
 * Resolve an issue key to an EPIC or accepted parent type by traversing
 * the Jira parent hierarchy (up to MAX_TRAVERSAL_DEPTH levels).
 */
export async function resolveEpic(
  jiraClient: AxiosInstance,
  issueKey: string,
  acceptedTypes: string[],
  traverseHierarchy: boolean,
  depth = 0,
): Promise<string> {
  if (!isValidJiraKey(issueKey) || depth >= MAX_TRAVERSAL_DEPTH) {
    return issueKey;
  }

  try {
    const { data: issue } = await jiraClient.get(`/rest/api/3/issue/${issueKey}`, {
      params: { fields: 'issuetype,parent' },
    });

    const issueType = issue.fields?.issuetype?.name;

    if (acceptedTypes.includes(issueType)) {
      logger.info(`Validated ${issueKey} as ${issueType}`);
      return issueKey;
    }

    if (traverseHierarchy && issue.fields?.parent?.key) {
      logger.info(
        `${issueKey} is ${issueType}, traversing to parent ${issue.fields.parent.key}`,
      );
      return resolveEpic(
        jiraClient,
        issue.fields.parent.key,
        acceptedTypes,
        traverseHierarchy,
        depth + 1,
      );
    }

    logger.info(`${issueKey} is ${issueType}, not in accepted types; using as-is`);
    return issueKey;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not resolve EPIC for ${issueKey}: ${msg}`);
    return issueKey;
  }
}
