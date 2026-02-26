#!/usr/bin/env node

/**
 * GitHub Advanced Security to Jira Cloud Integration Script
 * 
 * This script:
 * 1. Fetches code scanning alerts for a pull request
 * 2. Extracts user story references from PR description and commit messages
 * 3. Creates Jira issues for each security alert
 * 4. Links issues to user stories or uses fallback project
 */

const { Octokit } = require('@octokit/rest');
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ============================================================================
// Configuration & Environment Variables
// ============================================================================

const config = {
  // GitHub Configuration
  github: {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    prNumber: process.env.GITHUB_PR_NUMBER,
    prDescription: process.env.GITHUB_PR_DESCRIPTION || '',
    prUrl: process.env.GITHUB_PR_URL,
    headSha: process.env.GITHUB_HEAD_SHA,
    baseSha: process.env.GITHUB_BASE_SHA,
    eventName: process.env.GITHUB_EVENT_NAME || '',
    eventPath: process.env.GITHUB_EVENT_PATH || '',
    alertNumber: process.env.GITHUB_ALERT_NUMBER,
    alertUrl: process.env.GITHUB_ALERT_URL,
  },

  // Jira Configuration
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    userEmail: process.env.JIRA_USER_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    defaultProject: process.env.JIRA_DEFAULT_PROJECT,
    defaultIssueType: process.env.JIRA_DEFAULT_ISSUE_TYPE || 'Task',
    fallbackLabel: process.env.JIRA_FALLBACK_LABEL || 'missing-user-story',
    securityLabel: process.env.JIRA_SECURITY_LABEL || 'github-security-alert',
    linkType: process.env.JIRA_LINK_TYPE || 'Relates',
  },

  // Alert type configuration
  alerts: {
    code_scanning: {
      enabled: (process.env.ALERT_CODE_SCANNING_ENABLED || 'true') === 'true',
      severityThreshold: process.env.ALERT_CODE_SCANNING_SEVERITY || 'low',
    },
    secret_scanning: {
      enabled: (process.env.ALERT_SECRET_SCANNING_ENABLED || 'true') === 'true',
      severityThreshold: process.env.ALERT_SECRET_SCANNING_SEVERITY || 'low',
    },
    dependabot: {
      enabled: (process.env.ALERT_DEPENDABOT_ENABLED || 'true') === 'true',
      severityThreshold: process.env.ALERT_DEPENDABOT_SEVERITY || 'low',
    },
  },

  // Notification configuration
  notifications: {
    prComment: {
      enabled: (process.env.NOTIFY_PR_COMMENT || 'true') === 'true',
      onMissingEpic: (process.env.NOTIFY_ON_MISSING_EPIC || 'true') === 'true',
      onIssueCreated: (process.env.NOTIFY_ON_ISSUE_CREATED || 'true') === 'true',
    },
    slack: {
      enabled: (process.env.NOTIFY_SLACK_ENABLED || 'false') === 'true',
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    },
    teams: {
      enabled: (process.env.NOTIFY_TEAMS_ENABLED || 'false') === 'true',
      webhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
    },
  },

  // Duplicate detection
  deduplication: {
    enabled: (process.env.DEDUP_ENABLED || 'true') === 'true',
  },

  // EPIC resolution
  epicResolution: {
    validateType: (process.env.EPIC_VALIDATE_TYPE || 'true') === 'true',
    traverseHierarchy: (process.env.EPIC_TRAVERSE_HIERARCHY || 'true') === 'true',
    acceptedTypes: (process.env.EPIC_ACCEPTED_TYPES || 'Epic,Story').split(',').map(t => t.trim()),
  },

  // Config file path
  configFilePath: process.env.CONFIG_FILE_PATH || '.github/security-jira-config.yml',

  // Dry run mode for testing
  dryRun: process.argv.includes('--dry-run'),
};

// ============================================================================
// Logging & Utilities
// ============================================================================

const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1, note: 0, warning: 0 };

const metrics = { alertsProcessed: 0, issuesCreated: 0, duplicatesSkipped: 0, errors: 0, issueKeys: [] };

function log(level, message, data) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, message };
  if (data) entry.data = data;
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

function loadConfigFile() {
  try {
    const configPath = path.resolve(config.configFilePath);
    if (!fs.existsSync(configPath)) return;
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const fc = yaml.load(fileContent);
    if (!fc) return;

    if (fc.alerts) {
      for (const [type, s] of Object.entries(fc.alerts)) {
        const key = type.replace(/-/g, '_');
        if (config.alerts[key] && s) {
          if (s.enabled !== undefined && !process.env[`ALERT_${key.toUpperCase()}_ENABLED`]) config.alerts[key].enabled = s.enabled;
          if (s.severity_threshold && !process.env[`ALERT_${key.toUpperCase()}_SEVERITY`]) config.alerts[key].severityThreshold = s.severity_threshold;
        }
      }
    }
    if (fc.jira) {
      if (fc.jira.default_project && !process.env.JIRA_DEFAULT_PROJECT) config.jira.defaultProject = fc.jira.default_project;
      if (fc.jira.default_issue_type && !process.env.JIRA_DEFAULT_ISSUE_TYPE) config.jira.defaultIssueType = fc.jira.default_issue_type;
      if (fc.jira.link_type && !process.env.JIRA_LINK_TYPE) config.jira.linkType = fc.jira.link_type;
      if (fc.jira.security_label && !process.env.JIRA_SECURITY_LABEL) config.jira.securityLabel = fc.jira.security_label;
      if (fc.jira.fallback_label && !process.env.JIRA_FALLBACK_LABEL) config.jira.fallbackLabel = fc.jira.fallback_label;
    }
    if (fc.notifications) {
      const n = fc.notifications;
      if (n.pr_comment) {
        if (n.pr_comment.enabled !== undefined) config.notifications.prComment.enabled = n.pr_comment.enabled;
        if (n.pr_comment.on_missing_epic !== undefined) config.notifications.prComment.onMissingEpic = n.pr_comment.on_missing_epic;
        if (n.pr_comment.on_issue_created !== undefined) config.notifications.prComment.onIssueCreated = n.pr_comment.on_issue_created;
      }
      if (n.slack) {
        if (n.slack.enabled !== undefined) config.notifications.slack.enabled = n.slack.enabled;
        if (n.slack.webhook_url) config.notifications.slack.webhookUrl = n.slack.webhook_url;
      }
      if (n.teams) {
        if (n.teams.enabled !== undefined) config.notifications.teams.enabled = n.teams.enabled;
        if (n.teams.webhook_url) config.notifications.teams.webhookUrl = n.teams.webhook_url;
      }
    }
    if (fc.deduplication && fc.deduplication.enabled !== undefined) config.deduplication.enabled = fc.deduplication.enabled;
    if (fc.epic_resolution) {
      const e = fc.epic_resolution;
      if (e.validate_issue_type !== undefined) config.epicResolution.validateType = e.validate_issue_type;
      if (e.traverse_hierarchy !== undefined) config.epicResolution.traverseHierarchy = e.traverse_hierarchy;
      if (e.accepted_types) config.epicResolution.acceptedTypes = e.accepted_types;
    }
    log('info', `Loaded config from ${configPath}`);
  } catch (error) {
    log('warn', `Failed to load config file: ${error.message}`);
  }
}

function meetsSeverityThreshold(alertSeverity, threshold) {
  const alertLevel = SEVERITY_ORDER[(alertSeverity || '').toLowerCase()] ?? 0;
  const thresholdLevel = SEVERITY_ORDER[(threshold || '').toLowerCase()] ?? 0;
  return alertLevel >= thresholdLevel;
}

// ============================================================================
// User Story Extraction Logic
// ============================================================================

/**
 * Regex patterns for extracting Jira issue keys
 * Supports multiple formats:
 * - Direct issue keys: PROJ-123, SUB-PROJ-123
 * - User Story: PROJ-123
 * - JIRA: PROJ-123
 * - Story: PROJ-123
 */
const JIRA_KEY_PATTERNS = [
  // Direct Jira key pattern (e.g., PROJ-123, SUB-PROJ-123, ABC-456)
  // Supports keys with multiple hyphens before the final number
  /\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\b/g,
  
  // Explicit markers with issue key
  /(?:User Story|JIRA|Story|Issue):\s*([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)/gi,
  
  // Square bracket format [PROJ-123]
  /\[([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\]/g,
];

/**
 * Extract Jira issue keys from text using multiple patterns
 * @param {string} text - Text to search for Jira keys
 * @returns {string[]} Array of unique Jira issue keys
 */
function extractJiraKeys(text) {
  if (!text) return [];
  
  const keys = new Set();
  
  for (const pattern of JIRA_KEY_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // The Jira key is always in the first capture group (match[1])
      const key = match[1];
      // Validate the key format (supports multi-hyphen keys like SUB-PROJ-123)
      if (key && /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/.test(key)) {
        // Exclude common false positives (e.g., HTTP-200, UTF-8)
        if (!/^(HTTP|ERROR|ISO|UTF|TCP|UDP|SSL|TLS|API|SDK|CLI|URL|URI)-\d+$/.test(key)) {
          keys.add(key);
        }
      }
    }
  }
  
  return Array.from(keys);
}

/**
 * Find user story from PR description and commit messages
 * Precedence: PR description > Commit messages (most recent first)
 * @param {string} prDescription - Pull request description
 * @param {Array} commits - Array of commit objects
 * @returns {string|null} First valid Jira issue key found, or null
 */
function findUserStory(prDescription, commits) {
  // 1. Check PR description first (highest precedence)
  const prKeys = extractJiraKeys(prDescription);
  if (prKeys.length > 0) {
    console.log(`Found user story in PR description: ${prKeys[0]}`);
    return prKeys[0];
  }
  
  // 2. Check commit messages (most recent first)
  if (commits && commits.length > 0) {
    for (const commit of commits) {
      const commitMessage = commit.commit.message;
      const commitKeys = extractJiraKeys(commitMessage);
      if (commitKeys.length > 0) {
        console.log(`Found user story in commit ${commit.sha}: ${commitKeys[0]}`);
        return commitKeys[0];
      }
    }
  }
  
  console.log('No user story found in PR description or commits');
  return null;
}

// ============================================================================
// GitHub API Integration
// ============================================================================

/**
 * Initialize GitHub API client
 */
function createGitHubClient() {
  return new Octokit({
    auth: config.github.token,
  });
}

/**
 * Fetch code scanning alerts for a pull request
 * @param {Octokit} octokit - GitHub API client
 * @returns {Array} Array of code scanning alerts
 */
async function fetchCodeScanningAlerts(octokit) {
  const [owner, repo] = config.github.repository.split('/');
  
  try {
    console.log(`Fetching code scanning alerts for ${owner}/${repo} PR #${config.github.prNumber}...`);
    
    // Fetch all code scanning alerts for the repository
    const { data: allAlerts } = await octokit.codeScanning.listAlertsForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });
    
    // Filter alerts that affect files changed in this PR
    const prAlerts = await filterAlertsForPR(octokit, owner, repo, allAlerts);
    
    console.log(`Found ${prAlerts.length} code scanning alerts for this PR`);
    return prAlerts;
    
  } catch (error) {
    console.error('Error fetching code scanning alerts:', error.message);
    
    // If code scanning is not enabled, return empty array
    if (error.status === 404) {
      console.log('Code scanning not enabled for this repository');
      return [];
    }
    
    throw error;
  }
}

/**
 * Filter alerts to only those affecting files changed in the PR
 * @param {Octokit} octokit - GitHub API client
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Array} alerts - All code scanning alerts
 * @returns {Array} Filtered alerts
 */
async function filterAlertsForPR(octokit, owner, repo, alerts) {
  try {
    // Get files changed in the PR
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: config.github.prNumber,
    });
    
    const changedFiles = new Set(files.map(f => f.filename));
    
    // Filter alerts where the affected file is in the PR
    return alerts.filter(alert => {
      const alertPath = alert.most_recent_instance?.location?.path;
      return alertPath && changedFiles.has(alertPath);
    });
    
  } catch (error) {
    console.error('Error filtering alerts for PR:', error.message);
    // If we can't get PR files, return all alerts
    return alerts;
  }
}

/**
 * Fetch commits for the pull request
 * @param {Octokit} octokit - GitHub API client
 * @returns {Array} Array of commit objects
 */
async function fetchPRCommits(octokit) {
  const [owner, repo] = config.github.repository.split('/');
  
  try {
    const { data: commits } = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: config.github.prNumber,
    });
    
    console.log(`Fetched ${commits.length} commits from PR`);
    return commits;
    
  } catch (error) {
    console.error('Error fetching PR commits:', error.message);
    return [];
  }
}

// ============================================================================
// Event & Alert Processing
// ============================================================================

function getAlertFromEvent() {
  if (config.github.eventPath && fs.existsSync(config.github.eventPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(config.github.eventPath, 'utf8'));
      if (payload.alert) return { payload, alert: payload.alert, action: payload.action };
    } catch (e) {
      log('warn', `Could not read event payload: ${e.message}`);
    }
  }
  return null;
}

function normalizeAlertInput(eventName, rawAlert) {
  switch (eventName) {
    case 'code_scanning_alert':
      return {
        _type: 'code_scanning',
        number: rawAlert.number,
        html_url: rawAlert.html_url,
        rule: {
          id: rawAlert.rule?.id || '',
          severity: rawAlert.rule?.severity || 'medium',
          security_severity_level: rawAlert.rule?.security_severity_level || rawAlert.rule?.severity || 'medium',
          description: rawAlert.rule?.description || 'Code Scanning Alert',
          full_description: rawAlert.rule?.full_description || rawAlert.rule?.description || '',
        },
        most_recent_instance: rawAlert.most_recent_instance || { location: {} },
      };
    case 'secret_scanning_alert':
      return {
        _type: 'secret_scanning',
        number: rawAlert.number,
        html_url: rawAlert.html_url,
        rule: {
          id: rawAlert.secret_type || 'secret',
          severity: 'critical',
          security_severity_level: 'critical',
          description: `Secret Detected: ${rawAlert.secret_type_display_name || rawAlert.secret_type || 'Unknown'}`,
          full_description: `A ${rawAlert.secret_type_display_name || rawAlert.secret_type} secret was detected in the repository.`,
        },
        most_recent_instance: { location: { path: 'N/A' } },
      };
    case 'dependabot_alert':
      return {
        _type: 'dependabot',
        number: rawAlert.number,
        html_url: rawAlert.html_url,
        rule: {
          id: rawAlert.security_advisory?.cve_id || rawAlert.security_advisory?.ghsa_id || `dependabot-${rawAlert.number}`,
          severity: rawAlert.security_advisory?.severity || 'medium',
          security_severity_level: rawAlert.security_advisory?.severity || 'medium',
          description: rawAlert.security_advisory?.summary || 'Dependabot Alert',
          full_description: rawAlert.security_advisory?.description || '',
        },
        most_recent_instance: {
          location: { path: rawAlert.dependency?.manifest_path || 'N/A' },
          commit_sha: '',
        },
        _packageName: rawAlert.dependency?.package?.name,
        _vulnerableRange: rawAlert.vulnerable_version_range,
      };
    default:
      return null;
  }
}

async function findPRForCommit(octokit, commitSha) {
  if (!commitSha) return null;
  const [owner, repo] = config.github.repository.split('/');
  try {
    const { data: prs } = await octokit.repos.listPullRequestsAssociatedWithCommit({
      owner, repo, commit_sha: commitSha,
    });
    if (prs.length > 0) {
      log('info', `Found PR #${prs[0].number} for commit ${commitSha}`);
      return prs[0];
    }
  } catch (error) {
    log('warn', `Could not find PR for commit: ${error.message}`);
  }
  return null;
}

// ============================================================================
// Jira API Integration
// ============================================================================

/**
 * Create axios client for Jira API with retry logic
 */
function createJiraClient() {
  const client = axios.create({
    baseURL: config.jira.baseUrl,
    headers: {
      'Authorization': `Basic ${Buffer.from(
        `${config.jira.userEmail}:${config.jira.apiToken}`
      ).toString('base64')}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: 30000,
  });
  
  // Configure retry logic for transient failures
  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      // Retry on network errors or 5xx server errors
      return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
             (error.response && error.response.status >= 500);
    },
    onRetry: (retryCount, error) => {
      console.log(`Retry attempt ${retryCount} for ${error.config.url}`);
    },
  });
  
  return client;
}

/**
 * Verify if a Jira issue key exists
 * @param {axios} jiraClient - Jira API client
 * @param {string} issueKey - Jira issue key to verify
 * @returns {boolean} True if issue exists
 */
async function verifyJiraIssue(jiraClient, issueKey) {
  try {
    await jiraClient.get(`/rest/api/3/issue/${issueKey}`);
    console.log(`Verified Jira issue exists: ${issueKey}`);
    return true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`Jira issue not found: ${issueKey}`);
      return false;
    }
    throw error;
  }
}

/**
 * Create a Jira issue for a security alert
 * @param {axios} jiraClient - Jira API client
 * @param {Object} alert - Code scanning alert
 * @param {string|null} userStory - User story Jira key to link to
 * @returns {Object} Created Jira issue
 */
async function createJiraIssue(jiraClient, alert, userStory) {
  const [owner, repo] = config.github.repository.split('/');
  
  // Determine severity mapping to Jira priority
  const severityPriorityMap = {
    'critical': 'Highest',
    'high': 'High',
    'medium': 'Medium',
    'low': 'Low',
    'warning': 'Low',
    'note': 'Lowest',
    'error': 'High',
  };
  
  const priority = severityPriorityMap[alert.rule.security_severity_level || alert.rule.severity] || 'Medium';
  
  // Extract alert details
  const alertLocation = alert.most_recent_instance?.location;
  const filePath = alertLocation?.path || 'Unknown';
  const startLine = alertLocation?.start_line || 'N/A';
  const endLine = alertLocation?.end_line || 'N/A';
  
  // Build description with all required information
  const description = {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Security Alert Details' }]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Severity: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: `${alert.rule.security_severity_level || alert.rule.severity}` }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Rule: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: `${alert.rule.id}` }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Affected File: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: `${filePath}` }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Lines: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: `${startLine}-${endLine}` }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Description' }]
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: alert.rule.description || 'No description available' }]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Links' }]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'GitHub Security Alert: ', marks: [{ type: 'strong' }] },
          {
            type: 'text',
            text: alert.html_url,
            marks: [{ type: 'link', attrs: { href: alert.html_url } }]
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Pull Request: ', marks: [{ type: 'strong' }] },
          {
            type: 'text',
            text: config.github.prUrl,
            marks: [{ type: 'link', attrs: { href: config.github.prUrl } }]
          }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Repository Information' }]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Repository: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: config.github.repository }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Commit SHA: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: config.github.headSha }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'PR Number: ', marks: [{ type: 'strong' }] },
          { type: 'text', text: `#${config.github.prNumber}` }
        ]
      }
    ]
  };
  
  // Build labels array with deduplication identifier
  const alertType = alert._type || 'code_scanning';
  const labels = [config.jira.securityLabel, `severity-${alert.rule.security_severity_level || alert.rule.severity}`];
  if (!userStory) {
    labels.push(config.jira.fallbackLabel);
  }
  labels.push(`repo-${repo}`);
  labels.push(alertType.replace(/_/g, '-'));
  labels.push(`gh-alert-${repo}-${alertType}-${alert.number}`);
  
  // Extract project key from user story or use default
  // Supports both simple (PROJ-123) and complex (SUB-PROJ-123) keys
  let projectKey = config.jira.defaultProject;
  if (userStory) {
    // Match everything before the last hyphen-number combination
    const projectMatch = userStory.match(/^([A-Z][A-Z0-9-]+?)-\d+$/);
    projectKey = projectMatch ? projectMatch[1] : userStory.split('-')[0];
  }
  
  // Build issue payload
  const issuePayload = {
    fields: {
      project: {
        key: projectKey
      },
      summary: `[Security Alert] ${alert.rule.description || alert.rule.id} in ${filePath}`,
      description: description,
      issuetype: {
        name: config.jira.defaultIssueType
      },
      labels: labels,
      priority: { name: priority },
    }
  };
  
  if (config.dryRun) {
    log('info', 'DRY RUN - Would create Jira issue', { payload: issuePayload });
    return { key: 'DRY-RUN-123', dryRun: true };
  }
  
  try {
    const response = await jiraClient.post('/rest/api/3/issue', issuePayload);
    log('info', `Created Jira issue: ${response.data.key}`);
    
    // Create remote link for bi-directional traceability
    if (alert.html_url) {
      await createRemoteLink(jiraClient, response.data.key, alert.html_url, `GitHub Alert #${alert.number}`);
    }
    
    // If we have a user story, create an issue link
    if (userStory) {
      await linkJiraIssues(jiraClient, response.data.key, userStory);
    }
    
    return response.data;
    
  } catch (error) {
    log('error', 'Error creating Jira issue', { error: error.response?.data || error.message });
    throw error;
  }
}

/**
 * Link a security issue to a user story
 * @param {axios} jiraClient - Jira API client
 * @param {string} securityIssueKey - Created security issue key
 * @param {string} userStoryKey - User story issue key
 */
async function linkJiraIssues(jiraClient, securityIssueKey, userStoryKey) {
  if (config.dryRun) {
    console.log(`DRY RUN - Would link ${securityIssueKey} to ${userStoryKey}`);
    return;
  }
  
  try {
    // Verify the user story exists before linking
    const userStoryExists = await verifyJiraIssue(jiraClient, userStoryKey);
    if (!userStoryExists) {
      console.log(`User story ${userStoryKey} does not exist, skipping link`);
      return;
    }
    
    const linkPayload = {
      type: {
        name: config.jira.linkType
      },
      inwardIssue: {
        key: securityIssueKey
      },
      outwardIssue: {
        key: userStoryKey
      }
    };
    
    await jiraClient.post('/rest/api/3/issueLink', linkPayload);
    console.log(`Linked ${securityIssueKey} to user story ${userStoryKey}`);
    
  } catch (error) {
    console.error('Error linking Jira issues:', error.response?.data || error.message);
    // Don't throw - linking is not critical
  }
}

// ============================================================================
// EPIC Resolution & Traceability
// ============================================================================

async function resolveEpic(jiraClient, issueKey) {
  if (!config.epicResolution.validateType) return issueKey;
  try {
    const { data: issue } = await jiraClient.get(`/rest/api/3/issue/${issueKey}`, {
      params: { fields: 'issuetype,parent' },
    });
    const issueType = issue.fields?.issuetype?.name;
    if (config.epicResolution.acceptedTypes.includes(issueType)) {
      log('info', `Validated ${issueKey} as ${issueType}`);
      return issueKey;
    }
    if (config.epicResolution.traverseHierarchy && issue.fields?.parent) {
      log('info', `${issueKey} is ${issueType}, traversing to parent ${issue.fields.parent.key}`);
      return resolveEpic(jiraClient, issue.fields.parent.key);
    }
    log('info', `${issueKey} is ${issueType}, not in accepted types; using as-is`);
    return issueKey;
  } catch (error) {
    log('warn', `Could not resolve EPIC for ${issueKey}: ${error.message}`);
    return issueKey;
  }
}

async function checkForDuplicate(jiraClient, alert) {
  if (!config.deduplication.enabled) return false;
  const [, repo] = config.github.repository.split('/');
  const alertType = alert._type || 'code_scanning';
  const dedupLabel = `gh-alert-${repo}-${alertType}-${alert.number}`;
  try {
    const jql = `labels = "${dedupLabel}" AND labels = "${config.jira.securityLabel}"`;
    const response = await jiraClient.get('/rest/api/3/search', {
      params: { jql, maxResults: 1, fields: 'key' },
    });
    if (response.data.total > 0) {
      log('info', `Duplicate found: ${response.data.issues[0].key} for alert #${alert.number}`);
      return response.data.issues[0].key;
    }
  } catch (error) {
    log('warn', `Duplicate check failed: ${error.message}`);
  }
  return false;
}

async function createRemoteLink(jiraClient, issueKey, url, title) {
  if (config.dryRun || !url) return;
  try {
    await jiraClient.post(`/rest/api/3/issue/${issueKey}/remotelink`, {
      globalId: url,
      application: { type: 'com.github', name: 'GitHub Security' },
      relationship: 'discovered by',
      object: {
        url,
        title,
        icon: { url16x16: 'https://github.githubassets.com/favicons/favicon.svg' },
      },
    });
    log('info', `Created remote link on ${issueKey}`);
  } catch (error) {
    log('warn', `Failed to create remote link: ${error.message}`);
  }
}

async function postPRComment(octokit, prNumber, body) {
  if (config.dryRun || !prNumber || !config.notifications.prComment.enabled) return;
  const [owner, repo] = config.github.repository.split('/');
  try {
    await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
    log('info', `Posted comment on PR #${prNumber}`);
  } catch (error) {
    log('warn', `Failed to post PR comment: ${error.message}`);
  }
}

async function addPRLabels(octokit, prNumber, labels) {
  if (config.dryRun || !prNumber) return;
  const [owner, repo] = config.github.repository.split('/');
  try {
    await octokit.issues.addLabels({ owner, repo, issue_number: prNumber, labels });
    log('info', `Added labels to PR #${prNumber}: ${labels.join(', ')}`);
  } catch (error) {
    log('warn', `Failed to add PR labels: ${error.message}`);
  }
}

async function sendWebhookNotification(type, payload) {
  const targets = [];
  if (config.notifications.slack.enabled && config.notifications.slack.webhookUrl) {
    targets.push({
      name: 'Slack', url: config.notifications.slack.webhookUrl,
      body: {
        text: payload.title,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: payload.title } },
          { type: 'section', text: { type: 'mrkdwn', text: payload.message } },
          ...(payload.url ? [{ type: 'section', text: { type: 'mrkdwn', text: `<${payload.url}|View in Jira>` } }] : []),
        ],
      },
    });
  }
  if (config.notifications.teams.enabled && config.notifications.teams.webhookUrl) {
    targets.push({
      name: 'Teams', url: config.notifications.teams.webhookUrl,
      body: {
        '@type': 'MessageCard',
        summary: payload.title,
        themeColor: payload.severity === 'critical' ? 'FF0000' : payload.severity === 'high' ? 'FFA500' : '0076D7',
        title: payload.title,
        sections: [{ activityTitle: payload.message }],
        potentialAction: payload.url
          ? [{ '@type': 'OpenUri', name: 'View in Jira', targets: [{ os: 'default', uri: payload.url }] }]
          : [],
      },
    });
  }
  for (const target of targets) {
    try {
      await axios.post(target.url, target.body, { timeout: 10000 });
      log('info', `Sent ${type} notification to ${target.name}`);
    } catch (error) {
      log('warn', `Failed to send ${target.name} notification: ${error.message}`);
    }
  }
}

// ============================================================================
// Main Execution Logic
// ============================================================================

/**
 * Validate required configuration
 */
function validateConfig() {
  const required = {
    'GITHUB_TOKEN': config.github.token,
    'GITHUB_REPOSITORY': config.github.repository,
    'JIRA_BASE_URL': config.jira.baseUrl,
    'JIRA_USER_EMAIL': config.jira.userEmail,
    'JIRA_API_TOKEN': config.jira.apiToken,
    'JIRA_DEFAULT_PROJECT': config.jira.defaultProject,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key, _]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  log('info', '='.repeat(80));
  log('info', 'GitHub Advanced Security to Jira Integration');
  log('info', '='.repeat(80));

  try {
    // Load config file if present
    loadConfigFile();
    // Validate configuration
    validateConfig();

    if (config.dryRun) {
      log('info', 'Running in DRY RUN mode - no changes will be made');
    }

    // Initialize API clients
    const octokit = createGitHubClient();
    const jiraClient = createJiraClient();

    // Determine alert(s) to process
    let alertsToProcess = [];
    let associatedPR = null;

    const eventData = getAlertFromEvent();

    if (eventData && eventData.alert) {
      // Alert-event-driven mode (code_scanning_alert, secret_scanning_alert, dependabot_alert)
      const eventName = config.github.eventName;
      log('info', `Processing ${eventName} event`, { action: eventData.action });

      const normalized = normalizeAlertInput(eventName, eventData.alert);
      if (!normalized) {
        log('error', `Unsupported event type: ${eventName}`);
        return;
      }

      const alertConfig = config.alerts[normalized._type];
      if (alertConfig && !alertConfig.enabled) {
        log('info', `Alert type ${normalized._type} is disabled, skipping`);
        return;
      }

      if (alertConfig && !meetsSeverityThreshold(
        normalized.rule.security_severity_level, alertConfig.severityThreshold
      )) {
        log('info', `Alert severity ${normalized.rule.security_severity_level} below threshold ${alertConfig.severityThreshold}, skipping`);
        return;
      }

      alertsToProcess.push(normalized);

      // Try to find associated PR from commit
      const commitSha = normalized.most_recent_instance?.commit_sha;
      if (commitSha) {
        associatedPR = await findPRForCommit(octokit, commitSha);
      }

      // Populate PR context if found
      if (associatedPR) {
        config.github.prNumber = config.github.prNumber || associatedPR.number;
        config.github.prUrl = config.github.prUrl || associatedPR.html_url;
        config.github.prDescription = config.github.prDescription || associatedPR.body || '';
        config.github.headSha = config.github.headSha || associatedPR.head?.sha || '';
      }
    } else if (config.github.prNumber) {
      // Legacy PR-driven mode (backward compatibility)
      log('info', `Processing PR #${config.github.prNumber} alerts`);
      const rawAlerts = await fetchCodeScanningAlerts(octokit);
      for (const alert of rawAlerts) {
        const normalized = normalizeAlertInput('code_scanning_alert', alert);
        if (!normalized) continue;
        const alertConfig = config.alerts[normalized._type];
        if (alertConfig && !alertConfig.enabled) continue;
        if (alertConfig && !meetsSeverityThreshold(
          normalized.rule.security_severity_level, alertConfig.severityThreshold
        )) continue;
        alertsToProcess.push(normalized);
      }
    } else {
      log('info', 'No alert event or PR number found, nothing to process');
      return;
    }

    if (alertsToProcess.length === 0) {
      log('info', 'No alerts to process after filtering');
      return;
    }

    // Set safe defaults for description fields
    config.github.prUrl = config.github.prUrl || '';
    config.github.headSha = config.github.headSha || '';
    config.github.prNumber = config.github.prNumber || '';

    // Find user story from PR description and commits
    let commits = [];
    if (config.github.prNumber) {
      commits = await fetchPRCommits(octokit);
    }

    let userStory = findUserStory(config.github.prDescription, commits);

    // Resolve EPIC if user story found
    if (userStory) {
      const exists = await verifyJiraIssue(jiraClient, userStory);
      if (exists) {
        userStory = await resolveEpic(jiraClient, userStory);
        log('info', `Resolved user story/EPIC: ${userStory}`);
      } else {
        log('warn', `User story ${userStory} not found in Jira, using fallback`);
        userStory = null;
      }
    } else {
      log('info', `No user story found, using fallback project: ${config.jira.defaultProject}`);
    }

    // Process each alert
    log('info', `Processing ${alertsToProcess.length} alert(s)...`);
    const createdIssues = [];

    for (const alert of alertsToProcess) {
      metrics.alertsProcessed++;
      try {
        // Check for duplicates
        const existingKey = await checkForDuplicate(jiraClient, alert);
        if (existingKey) {
          log('info', `Skipping duplicate for alert #${alert.number}, existing: ${existingKey}`);
          metrics.duplicatesSkipped++;
          continue;
        }

        // Create Jira issue
        const issue = await createJiraIssue(jiraClient, alert, userStory);
        createdIssues.push({ ...issue, _alert: alert });
        metrics.issuesCreated++;
        metrics.issueKeys.push(issue.key);
      } catch (error) {
        log('error', `Failed to process alert #${alert.number}: ${error.message}`);
        metrics.errors++;
      }
    }

    // Post PR comment with created issues (bi-directional traceability)
    const prNumber = config.github.prNumber;
    if (prNumber && createdIssues.length > 0 && config.notifications.prComment.onIssueCreated) {
      const issueList = createdIssues.map(i => {
        const t = (i._alert._type || 'code_scanning').replace(/_/g, ' ');
        const sev = i._alert.rule?.security_severity_level || 'medium';
        return `| ${i.key} | ${t} | ${sev} | [View](${config.jira.baseUrl}/browse/${i.key}) |`;
      }).join('\n');

      const parts = [
        '## 🔒 Security → Jira Issues Created',
        '',
        '| Jira Key | Alert Type | Severity | Link |',
        '|----------|-----------|----------|------|',
        issueList,
        '',
        userStory ? `Linked to: **${userStory}**` : '⚠️ No EPIC/User Story found — issues created in default project.',
      ];
      await postPRComment(octokit, prNumber, parts.join('\n'));
    }

    // Notify on missing EPIC
    if (!userStory && prNumber && config.notifications.prComment.onMissingEpic && createdIssues.length > 0) {
      const msg = [
        '## ⚠️ Missing Jira EPIC / User Story',
        '',
        'No Jira key was found in this PR description or commit messages.',
        'Security issues have been created in the default project with the `missing-user-story` label.',
        '',
        '**Action Required:** Update this PR description with a valid Jira key (e.g., `User Story: PROJ-123`).',
      ].join('\n');
      await postPRComment(octokit, prNumber, msg);
    }

    // Add PR labels for traceability
    if (prNumber && createdIssues.length > 0) {
      await addPRLabels(octokit, prNumber, ['security-jira-synced']);
    }

    // Send webhook notifications
    if (createdIssues.length > 0) {
      await sendWebhookNotification('issue_created', {
        title: `Security Alerts → Jira: ${createdIssues.length} issue(s) created`,
        message: createdIssues.map(i =>
          `• ${i.key}: ${i._alert.rule?.description || 'Alert'} (${i._alert.rule?.security_severity_level || 'medium'})`
        ).join('\n'),
        severity: createdIssues[0]._alert.rule?.security_severity_level || 'medium',
        url: createdIssues.length === 1 ? `${config.jira.baseUrl}/browse/${createdIssues[0].key}` : undefined,
      });
    }

    if (!userStory && createdIssues.length > 0) {
      await sendWebhookNotification('missing_epic', {
        title: 'Missing EPIC/User Story in Security Integration',
        message: `Repository: ${config.github.repository}\nPR: #${prNumber || 'N/A'}\nIssues created in default project.`,
        severity: 'medium',
      });
    }

    // Output metrics summary
    log('info', '='.repeat(80));
    log('info', 'Integration Complete', metrics);
    log('info', '='.repeat(80));

    if (createdIssues.length > 0 && !config.dryRun) {
      console.log('\nCreated Jira Issues:');
      createdIssues.forEach(issue => {
        console.log(`  - ${issue.key}: ${config.jira.baseUrl}/browse/${issue.key}`);
      });
    }

  } catch (error) {
    log('error', `Fatal error: ${error.message}`);
    if (error.response) {
      log('error', 'Response data', { data: error.response.data });
    }
    process.exit(1);
  }
}

// Execute main function
if (require.main === module) {
  main();
}

module.exports = {
  extractJiraKeys,
  findUserStory,
  createJiraIssue,
  normalizeAlertInput,
  meetsSeverityThreshold,
  checkForDuplicate,
  main,
};
