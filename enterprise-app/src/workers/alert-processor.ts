import type { ServiceBusReceivedMessage, ProcessErrorArgs } from '@azure/service-bus';
import { v4 as uuidv4 } from 'uuid';
import { createReceiver, getQueueNames } from '../services/queue/queue-service';
import { getOrgConfig, mergeRepoOverrides } from '../services/config/config-service';
import { getJiraCredentials, getWebhookUrl } from '../services/secrets/secrets-service';
import { createGitHubClient } from '../services/github/client';
import { createJiraClient } from '../services/jira/client';
import { findPRForCommit, fetchPRCommits, postPRComment } from '../services/github/pr-service';
import { createJiraIssue, linkJiraIssues, createRemoteLink } from '../services/jira/issue-service';
import { checkForDuplicate } from '../services/jira/dedup-service';
import { resolveEpic } from '../services/jira/epic-resolver';
import { verifyJiraIssue } from '../services/jira/issue-service';
import { normalizeAlert } from './alert-normalizer';
import { findUserStory } from '../utils/jira-key-extractor';
import { meetsSeverityThreshold } from '../utils/sanitization';
import { getEffectiveSeverity } from '../utils/severity';
import { sendSlackNotification } from '../services/notification/slack';
import { sendTeamsNotification } from '../services/notification/teams';
import type { AlertMessage } from '../models/alert';
import type { OrgConfig } from '../models/org-config';
import { createLogger } from '../utils/logger';

const logger = createLogger('alert-processor');

interface ProcessingContext {
  appId: string;
  privateKey: string;
}

/**
 * Process a single alert message from the queue.
 */
async function processAlertMessage(
  message: AlertMessage,
  ctx: ProcessingContext,
): Promise<void> {
  const startTime = Date.now();
  const correlationId = message.deliveryId || uuidv4();
  const { org, repo } = message;

  logger.info(`Processing ${message.event} alert`, {
    correlationId,
    org,
    repo,
    data: { action: message.action, severity: message.severity },
  });

  // 1. Load org config
  let orgConfig: OrgConfig = await getOrgConfig(org);
  if (!orgConfig.enabled) {
    logger.info(`Org '${org}' is disabled, skipping`, { correlationId, org });
    return;
  }

  // Apply repo-level overrides
  orgConfig = mergeRepoOverrides(orgConfig, repo);

  // 2. Normalize the alert
  const normalized = normalizeAlert(message.event, message.payload.alert as Record<string, unknown>);
  if (!normalized) {
    logger.warn('Could not normalize alert, skipping', { correlationId, org, repo });
    return;
  }

  // 3. Check alert type enabled + severity threshold
  const alertConfig = orgConfig.alerts[normalized._type];
  if (!alertConfig?.enabled) {
    logger.info(`Alert type ${normalized._type} disabled for org '${org}'`, {
      correlationId,
      org,
    });
    return;
  }

  const severity = getEffectiveSeverity(normalized);
  if (!meetsSeverityThreshold(severity, alertConfig.severityThreshold)) {
    logger.info(
      `Severity '${severity}' below threshold '${alertConfig.severityThreshold}', skipping`,
      { correlationId, org },
    );
    return;
  }

  // 4. Get GitHub client via installation token
  const installationId = message.payload.installation.id;
  const octokit = await createGitHubClient(ctx.appId, ctx.privateKey, installationId);

  // 5. Get Jira client
  const jiraCreds = await getJiraCredentials(orgConfig.jira.credentialRef);
  const jiraClient = createJiraClient(orgConfig.jira.baseUrl, jiraCreds);

  // 6. Check for duplicates
  const repoName = repo.split('/')[1] || repo;
  const existingKey = await checkForDuplicate(
    jiraClient,
    normalized,
    repoName,
    orgConfig.jira.securityLabel,
  );
  if (existingKey) {
    logger.info(`Duplicate skipped: ${existingKey} for alert #${normalized.number}`, {
      correlationId,
      org,
      repo,
    });
    return;
  }

  // 7. Find associated PR and extract user story
  const [owner, repoShort] = repo.split('/');
  const commitSha = normalized.most_recent_instance?.commit_sha;
  let prNumber: number | null = null;
  let prUrl = '';
  let prBody = '';
  let headSha = commitSha || '';

  if (commitSha) {
    const pr = await findPRForCommit(octokit, owner, repoShort, commitSha);
    if (pr) {
      prNumber = pr.number;
      prUrl = pr.htmlUrl;
      prBody = pr.body;
      headSha = pr.headSha;
    }
  }

  // Extract user story
  let commits: { sha: string; message: string }[] = [];
  if (prNumber) {
    commits = await fetchPRCommits(octokit, owner, repoShort, prNumber);
  }
  let userStory = findUserStory(prBody, commits);

  // 8. Resolve EPIC if configured
  if (userStory && orgConfig.epicResolution.enabled) {
    const exists = await verifyJiraIssue(jiraClient, userStory);
    if (exists && orgConfig.epicResolution.validateType) {
      userStory = await resolveEpic(
        jiraClient,
        userStory,
        orgConfig.epicResolution.acceptedTypes,
        orgConfig.epicResolution.traverseHierarchy,
      );
    } else if (!exists) {
      logger.warn(`User story ${userStory} not found in Jira, using fallback`, {
        correlationId,
        org,
      });
      userStory = null;
    }
  }

  // 9. Create Jira issue
  const issue = await createJiraIssue(
    jiraClient,
    normalized,
    userStory,
    orgConfig.jira,
    repo,
    prUrl,
    headSha,
    prNumber,
  );

  // 10. Link to user story + create remote link
  if (userStory) {
    await linkJiraIssues(jiraClient, issue.key, userStory, orgConfig.jira.linkType);
  }
  if (normalized.html_url) {
    await createRemoteLink(
      jiraClient,
      issue.key,
      normalized.html_url,
      `GitHub Alert #${normalized.number}`,
    );
  }

  // 11. Post PR comment
  if (prNumber && orgConfig.notifications.prComment.enabled) {
    const jiraUrl = `${orgConfig.jira.baseUrl}/browse/${issue.key}`;
    const comment = [
      '## \uD83D\uDD12 Security \u2192 Jira Issue Created',
      '',
      `| Jira Key | Alert Type | Severity | Link |`,
      `|----------|-----------|----------|------|`,
      `| ${issue.key} | ${normalized._type.replace(/_/g, ' ')} | ${severity} | [View](${jiraUrl}) |`,
      '',
      userStory
        ? `Linked to: **${userStory}**`
        : '\u26A0\uFE0F No EPIC/User Story found \u2014 issue created in default project.',
    ].join('\n');

    await postPRComment(octokit, owner, repoShort, prNumber, comment);
  }

  // 12. Send notifications
  const notifPayload = {
    title: `Security Alert: ${normalized.rule.description}`,
    message: `[${issue.key}] ${severity} ${normalized._type} alert in ${repo}`,
    severity,
    url: `${orgConfig.jira.baseUrl}/browse/${issue.key}`,
  };

  if (orgConfig.notifications.slack.enabled && orgConfig.notifications.slack.webhookRef) {
    const slackUrl = await getWebhookUrl(orgConfig.notifications.slack.webhookRef);
    if (slackUrl) await sendSlackNotification(slackUrl, notifPayload);
  }
  if (orgConfig.notifications.teams.enabled && orgConfig.notifications.teams.webhookRef) {
    const teamsUrl = await getWebhookUrl(orgConfig.notifications.teams.webhookRef);
    if (teamsUrl) await sendTeamsNotification(teamsUrl, notifPayload);
  }

  const durationMs = Date.now() - startTime;
  logger.info(`Successfully created ${issue.key} in ${durationMs}ms`, {
    correlationId,
    org,
    repo,
    data: {
      jiraKey: issue.key,
      alertType: normalized._type,
      alertNumber: normalized.number,
      severity,
      durationMs,
    },
  });
}

/**
 * Start queue workers that listen on all priority queues.
 */
export function startWorkers(ctx: ProcessingContext): void {
  const queueNames = getQueueNames();

  for (const queueName of queueNames) {
    const receiver = createReceiver(queueName);

    receiver.subscribe({
      processMessage: async (message: ServiceBusReceivedMessage) => {
        const body = message.body as AlertMessage;
        try {
          await processAlertMessage(body, ctx);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to process alert: ${msg}`, {
            correlationId: body.deliveryId,
            org: body.org,
            repo: body.repo,
            data: { error: msg },
          });
          throw error; // Let Service Bus handle retry / dead-letter
        }
      },
      processError: async (args: ProcessErrorArgs) => {
        logger.error(`Queue error on ${queueName}: ${args.error.message}`, {
          data: { errorSource: args.errorSource },
        });
      },
    });

    logger.info(`Worker started for queue: ${queueName}`);
  }
}
