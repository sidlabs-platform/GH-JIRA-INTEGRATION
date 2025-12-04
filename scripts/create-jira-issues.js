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
  },
  
  // Dry run mode for testing
  dryRun: process.argv.includes('--dry-run'),
};

// ============================================================================
// User Story Extraction Logic
// ============================================================================

/**
 * Regex patterns for extracting Jira issue keys
 * Supports multiple formats:
 * - Direct issue keys: PROJ-123
 * - User Story: PROJ-123
 * - JIRA: PROJ-123
 * - Story: PROJ-123
 */
const JIRA_KEY_PATTERNS = [
  // Direct Jira key pattern (e.g., PROJ-123, ABC-456)
  /\b([A-Z][A-Z0-9]+-\d+)\b/g,
  
  // Explicit markers with issue key
  /(?:User Story|JIRA|Story|Issue):\s*([A-Z][A-Z0-9]+-\d+)/gi,
  
  // Square bracket format [PROJ-123]
  /\[([A-Z][A-Z0-9]+-\d+)\]/g,
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
      // The Jira key is in the first or second capture group
      const key = match[1] || match[0];
      if (key && /^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
        keys.add(key);
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
  
  // Build labels array
  const labels = [config.jira.securityLabel, `severity-${alert.rule.security_severity_level || alert.rule.severity}`];
  if (!userStory) {
    labels.push(config.jira.fallbackLabel);
  }
  labels.push(`repo-${repo}`);
  labels.push('code-scanning');
  
  // Build issue payload
  const issuePayload = {
    fields: {
      project: {
        key: userStory ? userStory.split('-')[0] : config.jira.defaultProject
      },
      summary: `[Security Alert] ${alert.rule.description || alert.rule.id} in ${filePath}`,
      description: description,
      issuetype: {
        name: config.jira.defaultIssueType
      },
      labels: labels,
    }
  };
  
  // Set priority if the field is available
  try {
    issuePayload.fields.priority = { name: priority };
  } catch (error) {
    console.log('Priority field may not be available, continuing without it');
  }
  
  if (config.dryRun) {
    console.log('DRY RUN - Would create Jira issue:');
    console.log(JSON.stringify(issuePayload, null, 2));
    return { key: 'DRY-RUN-123', dryRun: true };
  }
  
  try {
    const response = await jiraClient.post('/rest/api/3/issue', issuePayload);
    console.log(`Created Jira issue: ${response.data.key}`);
    
    // If we have a user story, create an issue link
    if (userStory) {
      await linkJiraIssues(jiraClient, response.data.key, userStory);
    }
    
    return response.data;
    
  } catch (error) {
    console.error('Error creating Jira issue:', error.response?.data || error.message);
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
        name: 'Relates'
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
// Main Execution Logic
// ============================================================================

/**
 * Validate required configuration
 */
function validateConfig() {
  const required = {
    'GITHUB_TOKEN': config.github.token,
    'GITHUB_REPOSITORY': config.github.repository,
    'GITHUB_PR_NUMBER': config.github.prNumber,
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
  console.log('='.repeat(80));
  console.log('GitHub Advanced Security to Jira Integration');
  console.log('='.repeat(80));
  
  try {
    // Validate configuration
    validateConfig();
    
    if (config.dryRun) {
      console.log('Running in DRY RUN mode - no changes will be made');
    }
    
    // Initialize API clients
    const octokit = createGitHubClient();
    const jiraClient = createJiraClient();
    
    // Fetch PR commits to extract user story
    const commits = await fetchPRCommits(octokit);
    
    // Find user story from PR description and commits
    const userStory = findUserStory(config.github.prDescription, commits);
    
    if (userStory) {
      console.log(`Using user story: ${userStory}`);
    } else {
      console.log(`No user story found - will use fallback project: ${config.jira.defaultProject}`);
    }
    
    // Fetch code scanning alerts
    const alerts = await fetchCodeScanningAlerts(octokit);
    
    if (alerts.length === 0) {
      console.log('No security alerts found for this PR');
      console.log('Exiting successfully');
      return;
    }
    
    // Create Jira issues for each alert
    console.log(`Creating Jira issues for ${alerts.length} alerts...`);
    const createdIssues = [];
    
    for (const alert of alerts) {
      try {
        const issue = await createJiraIssue(jiraClient, alert, userStory);
        createdIssues.push(issue);
        console.log(`✓ Created issue for alert: ${alert.rule.id}`);
      } catch (error) {
        console.error(`✗ Failed to create issue for alert ${alert.rule.id}:`, error.message);
      }
    }
    
    console.log('='.repeat(80));
    console.log(`Successfully created ${createdIssues.length} of ${alerts.length} Jira issues`);
    console.log('='.repeat(80));
    
    // Output summary for GitHub Actions
    if (createdIssues.length > 0 && !config.dryRun) {
      console.log('\nCreated Jira Issues:');
      createdIssues.forEach(issue => {
        console.log(`  - ${issue.key}: ${config.jira.baseUrl}/browse/${issue.key}`);
      });
    }
    
  } catch (error) {
    console.error('Fatal error:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
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
  main,
};
