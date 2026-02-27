import type { AxiosInstance } from 'axios';
import type { NormalizedAlert } from '../../models/alert';
import type { OrgJiraConfig } from '../../models/org-config';
import {
  sanitizeString,
  sanitizeLabel,
  sanitizeUrl,
  isValidJiraKey,
  MAX_SUMMARY_LENGTH,
} from '../../utils/sanitization';
import { mapSeverityToPriority, getEffectiveSeverity } from '../../utils/severity';
import { extractProjectKey } from '../../utils/jira-key-extractor';
import { createLogger } from '../../utils/logger';

const logger = createLogger('jira-issue-service');

export interface CreatedIssue {
  key: string;
  id: string;
  self: string;
}

/** Verify a Jira issue key exists. */
export async function verifyJiraIssue(
  jiraClient: AxiosInstance,
  issueKey: string,
): Promise<boolean> {
  if (!isValidJiraKey(issueKey)) return false;
  try {
    await jiraClient.get(`/rest/api/3/issue/${issueKey}`);
    return true;
  } catch (error: unknown) {
    const axiosErr = error as { response?: { status: number } };
    if (axiosErr.response?.status === 404) return false;
    throw error;
  }
}

/** Build Atlassian Document Format description for a security alert. */
function buildDescription(
  alert: NormalizedAlert,
  repoFullName: string,
  prUrl: string,
  headSha: string,
  prNumber: number | null,
): Record<string, unknown> {
  const filePath = alert.most_recent_instance?.location?.path || 'Unknown';
  const startLine = alert.most_recent_instance?.location?.start_line ?? 'N/A';
  const endLine = alert.most_recent_instance?.location?.end_line ?? 'N/A';

  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Security Alert Details' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Severity: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: getEffectiveSeverity(alert) },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Rule: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: alert.rule.id },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Affected File: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: filePath },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Lines: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: `${startLine}-${endLine}` },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Description' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: alert.rule.description || 'No description available' },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Links' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'GitHub Security Alert: ', marks: [{ type: 'strong' }] },
          {
            type: 'text',
            text: alert.html_url || 'N/A',
            marks: alert.html_url
              ? [{ type: 'link', attrs: { href: alert.html_url } }]
              : [],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Pull Request: ', marks: [{ type: 'strong' }] },
          {
            type: 'text',
            text: prUrl || 'N/A',
            marks: prUrl ? [{ type: 'link', attrs: { href: prUrl } }] : [],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Repository Information' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Repository: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: sanitizeString(repoFullName) },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Commit SHA: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: sanitizeString(headSha, 40) || 'N/A' },
        ],
      },
      ...(prNumber
        ? [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'PR Number: ', marks: [{ type: 'strong' }] },
                { type: 'text', text: `#${prNumber}` },
              ],
            },
          ]
        : []),
    ],
  };
}

/** Create a Jira issue for a security alert. */
export async function createJiraIssue(
  jiraClient: AxiosInstance,
  alert: NormalizedAlert,
  userStory: string | null,
  jiraConfig: OrgJiraConfig,
  repoFullName: string,
  prUrl: string,
  headSha: string,
  prNumber: number | null,
): Promise<CreatedIssue> {
  const repoName = repoFullName.split('/')[1] || repoFullName;
  const severity = getEffectiveSeverity(alert);
  const priority = mapSeverityToPriority(severity);
  const filePath = alert.most_recent_instance?.location?.path || 'Unknown';

  // Build labels
  const labels = [
    sanitizeLabel(jiraConfig.securityLabel),
    sanitizeLabel(`severity-${severity}`),
    sanitizeLabel(`repo-${repoName}`),
    sanitizeLabel(alert._type.replace(/_/g, '-')),
    sanitizeLabel(`gh-alert-${repoName}-${alert._type}-${alert.number}`),
  ];
  if (!userStory) {
    labels.push(sanitizeLabel(jiraConfig.fallbackLabel));
  }

  // Determine project key
  const projectKey = userStory
    ? extractProjectKey(userStory, jiraConfig.defaultProject)
    : jiraConfig.defaultProject;

  const description = buildDescription(alert, repoFullName, prUrl, headSha, prNumber);

  const issuePayload = {
    fields: {
      project: { key: sanitizeString(projectKey, 50) },
      summary: sanitizeString(
        `[Security Alert] ${alert.rule.description || alert.rule.id} in ${filePath}`,
        MAX_SUMMARY_LENGTH,
      ),
      description,
      issuetype: { name: sanitizeString(jiraConfig.defaultIssueType, 50) },
      labels,
      priority: { name: priority },
    },
  };

  const response = await jiraClient.post('/rest/api/3/issue', issuePayload);
  const created: CreatedIssue = response.data;

  logger.info(`Created Jira issue: ${created.key}`, {
    data: { alertType: alert._type, alertNumber: alert.number, severity },
  });

  return created;
}

/** Link two Jira issues together. */
export async function linkJiraIssues(
  jiraClient: AxiosInstance,
  securityIssueKey: string,
  userStoryKey: string,
  linkType: string,
): Promise<void> {
  if (!isValidJiraKey(securityIssueKey) || !isValidJiraKey(userStoryKey)) return;

  try {
    const exists = await verifyJiraIssue(jiraClient, userStoryKey);
    if (!exists) {
      logger.warn(`User story ${userStoryKey} not found, skipping link`);
      return;
    }

    await jiraClient.post('/rest/api/3/issueLink', {
      type: { name: sanitizeString(linkType, 50) },
      inwardIssue: { key: securityIssueKey },
      outwardIssue: { key: userStoryKey },
    });

    logger.info(`Linked ${securityIssueKey} to ${userStoryKey}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Error linking issues: ${msg}`);
  }
}

/** Create a remote link on a Jira issue for bidirectional traceability. */
export async function createRemoteLink(
  jiraClient: AxiosInstance,
  issueKey: string,
  url: string,
  title: string,
): Promise<void> {
  if (!isValidJiraKey(issueKey)) return;
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;

  try {
    await jiraClient.post(`/rest/api/3/issue/${issueKey}/remotelink`, {
      globalId: safeUrl,
      application: { type: 'com.github', name: 'GitHub Security' },
      relationship: 'discovered by',
      object: {
        url: safeUrl,
        title: sanitizeString(title),
        icon: { url16x16: 'https://github.githubassets.com/favicons/favicon.svg' },
      },
    });
    logger.info(`Created remote link on ${issueKey}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to create remote link: ${msg}`);
  }
}
