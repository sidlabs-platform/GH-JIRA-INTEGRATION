# API Reference

Complete reference for the GitHub Advanced Security to Jira integration APIs and interfaces.

---

## Table of Contents

- [GitHub APIs](#github-apis)
- [Jira APIs](#jira-apis)
- [Script Functions](#script-functions)
- [Environment Variables](#environment-variables)
- [Data Structures](#data-structures)

---

## GitHub APIs

### Code Scanning API

#### List Code Scanning Alerts

```
GET /repos/{owner}/{repo}/code-scanning/alerts
```

**Parameters:**
- `state` (string): Filter by alert state (`open`, `closed`, `dismissed`, `fixed`)
- `per_page` (integer): Results per page (default: 30, max: 100)
- `page` (integer): Page number

**Response:**
```json
[
  {
    "number": 123,
    "created_at": "2023-01-01T00:00:00Z",
    "url": "https://api.github.com/repos/owner/repo/code-scanning/alerts/123",
    "html_url": "https://github.com/owner/repo/security/code-scanning/123",
    "state": "open",
    "dismissed_at": null,
    "dismissed_by": null,
    "dismissed_reason": null,
    "rule": {
      "id": "js/sql-injection",
      "severity": "error",
      "security_severity_level": "high",
      "description": "Database query built from user-controlled sources",
      "name": "js/sql-injection"
    },
    "most_recent_instance": {
      "ref": "refs/heads/main",
      "analysis_key": ".github/workflows/codeql.yml:analyze",
      "environment": "{}",
      "state": "open",
      "commit_sha": "abc123",
      "message": {
        "text": "Unsanitized user input is used in SQL query"
      },
      "location": {
        "path": "src/controllers/user.js",
        "start_line": 45,
        "end_line": 47,
        "start_column": 10,
        "end_column": 50
      }
    }
  }
]
```

**Documentation:** https://docs.github.com/en/rest/code-scanning

---

### Pull Requests API

#### Get Pull Request

```
GET /repos/{owner}/{repo}/pulls/{pull_number}
```

**Response:**
```json
{
  "number": 456,
  "state": "open",
  "title": "Add user authentication",
  "body": "Implements JWT authentication\n\nUser Story: AUTH-123",
  "html_url": "https://github.com/owner/repo/pull/456",
  "head": {
    "sha": "def456",
    "ref": "feature/auth"
  },
  "base": {
    "sha": "abc123",
    "ref": "main"
  }
}
```

#### List Pull Request Commits

```
GET /repos/{owner}/{repo}/pulls/{pull_number}/commits
```

**Response:**
```json
[
  {
    "sha": "def456",
    "commit": {
      "message": "feat: add JWT middleware\n\nUser Story: AUTH-123"
    }
  }
]
```

#### List Pull Request Files

```
GET /repos/{owner}/{repo}/pulls/{pull_number}/files
```

**Response:**
```json
[
  {
    "filename": "src/auth/middleware.js",
    "status": "added",
    "additions": 100,
    "deletions": 0
  }
]
```

**Documentation:** https://docs.github.com/en/rest/pulls

---

## Jira APIs

### Issue API

#### Create Issue

```
POST /rest/api/3/issue
```

**Request Body:**
```json
{
  "fields": {
    "project": {
      "key": "PROJ"
    },
    "summary": "[Security Alert] SQL Injection in user.js",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "Security alert description"
            }
          ]
        }
      ]
    },
    "issuetype": {
      "name": "Task"
    },
    "priority": {
      "name": "High"
    },
    "labels": [
      "github-security-alert",
      "severity-high",
      "code-scanning"
    ]
  }
}
```

**Response:**
```json
{
  "id": "10000",
  "key": "PROJ-123",
  "self": "https://your-domain.atlassian.net/rest/api/3/issue/10000"
}
```

**Documentation:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post

---

#### Get Issue

```
GET /rest/api/3/issue/{issueIdOrKey}
```

**Response:**
```json
{
  "id": "10000",
  "key": "PROJ-123",
  "fields": {
    "summary": "User authentication story",
    "status": {
      "name": "In Progress"
    }
  }
}
```

**Documentation:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get

---

### Issue Link API

#### Create Issue Link

```
POST /rest/api/3/issueLink
```

**Request Body:**
```json
{
  "type": {
    "name": "Relates"
  },
  "inwardIssue": {
    "key": "SEC-789"
  },
  "outwardIssue": {
    "key": "PROJ-123"
  }
}
```

**Response:**
```json
{
  "id": "10001",
  "self": "https://your-domain.atlassian.net/rest/api/3/issueLink/10001"
}
```

**Documentation:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/#api-rest-api-3-issuelink-post

---

## Script Functions

### User Story Extraction

#### extractJiraKeys(text)

Extracts Jira issue keys from text using regex patterns.

**Parameters:**
- `text` (string): Text to search for Jira keys

**Returns:**
- `string[]`: Array of unique Jira issue keys

**Examples:**
```javascript
extractJiraKeys('User Story: PROJ-123')
// Returns: ['PROJ-123']

extractJiraKeys('Working on PROJ-123 and PROJ-456')
// Returns: ['PROJ-123', 'PROJ-456']

extractJiraKeys('[AUTH-789] Add authentication')
// Returns: ['AUTH-789']
```

**Supported Patterns:**
```javascript
// Direct Jira key
/\b([A-Z][A-Z0-9]+-\d+)\b/g

// Explicit markers
/(?:User Story|JIRA|Story|Issue):\s*([A-Z][A-Z0-9]+-\d+)/gi

// Bracketed format
/\[([A-Z][A-Z0-9]+-\d+)\]/g
```

---

#### findUserStory(prDescription, commits)

Finds the first user story from PR description and commits.

**Parameters:**
- `prDescription` (string): Pull request description
- `commits` (Array): Array of commit objects from GitHub API

**Returns:**
- `string | null`: First valid Jira issue key, or null if none found

**Precedence:**
1. PR description (highest priority)
2. Commit messages (most recent to oldest)

**Example:**
```javascript
const commits = [
  { commit: { message: 'feat: add feature [AUTH-100]' } },
  { commit: { message: 'fix: bug fix' } }
];

findUserStory('PR description with PROJ-123', commits)
// Returns: 'PROJ-123'

findUserStory('No user story here', commits)
// Returns: 'AUTH-100'

findUserStory('', [])
// Returns: null
```

---

### GitHub Integration

#### fetchCodeScanningAlerts(octokit)

Fetches code scanning alerts for the current PR.

**Parameters:**
- `octokit` (Octokit): Authenticated GitHub API client

**Returns:**
- `Promise<Array>`: Array of code scanning alert objects

**Environment Variables Used:**
- `GITHUB_REPOSITORY`
- `GITHUB_PR_NUMBER`

**Example:**
```javascript
const octokit = createGitHubClient();
const alerts = await fetchCodeScanningAlerts(octokit);
// Returns array of alerts affecting files in the PR
```

---

#### fetchPRCommits(octokit)

Fetches all commits in the current PR.

**Parameters:**
- `octokit` (Octokit): Authenticated GitHub API client

**Returns:**
- `Promise<Array>`: Array of commit objects

**Environment Variables Used:**
- `GITHUB_REPOSITORY`
- `GITHUB_PR_NUMBER`

---

### Jira Integration

#### createJiraIssue(jiraClient, alert, userStory)

Creates a Jira issue for a security alert.

**Parameters:**
- `jiraClient` (axios): Configured Jira API client
- `alert` (Object): GitHub code scanning alert object
- `userStory` (string | null): User story to link to (optional)

**Returns:**
- `Promise<Object>`: Created Jira issue object

**Example:**
```javascript
const jiraClient = createJiraClient();
const alert = {
  rule: {
    id: 'js/sql-injection',
    severity: 'error',
    security_severity_level: 'high',
    description: 'SQL injection vulnerability'
  },
  most_recent_instance: {
    location: {
      path: 'src/user.js',
      start_line: 45,
      end_line: 47
    }
  },
  html_url: 'https://github.com/owner/repo/security/code-scanning/123'
};

const issue = await createJiraIssue(jiraClient, alert, 'PROJ-123');
// Returns: { key: 'SEC-456', id: '10000', ... }
```

---

#### verifyJiraIssue(jiraClient, issueKey)

Verifies if a Jira issue exists.

**Parameters:**
- `jiraClient` (axios): Configured Jira API client
- `issueKey` (string): Jira issue key to verify

**Returns:**
- `Promise<boolean>`: True if issue exists, false otherwise

**Example:**
```javascript
const exists = await verifyJiraIssue(jiraClient, 'PROJ-123');
// Returns: true or false
```

---

#### linkJiraIssues(jiraClient, securityIssueKey, userStoryKey)

Creates a link between two Jira issues.

**Parameters:**
- `jiraClient` (axios): Configured Jira API client
- `securityIssueKey` (string): Created security issue key
- `userStoryKey` (string): User story issue key

**Returns:**
- `Promise<void>`

**Example:**
```javascript
await linkJiraIssues(jiraClient, 'SEC-456', 'PROJ-123');
// Creates "Relates" link between issues
```

---

## Environment Variables

### Required Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `GITHUB_TOKEN` | Secret | GitHub API authentication | `ghp_xxxxx` |
| `GITHUB_REPOSITORY` | Auto | Repository name | `owner/repo` |
| `GITHUB_PR_NUMBER` | Auto | Pull request number | `456` |
| `GITHUB_PR_DESCRIPTION` | Auto | PR description text | `User Story: PROJ-123` |
| `GITHUB_PR_URL` | Auto | PR URL | `https://github.com/owner/repo/pull/456` |
| `GITHUB_HEAD_SHA` | Auto | Head commit SHA | `def456` |
| `GITHUB_BASE_SHA` | Auto | Base commit SHA | `abc123` |
| `JIRA_BASE_URL` | Secret | Jira instance URL | `https://example.atlassian.net` |
| `JIRA_USER_EMAIL` | Secret | Jira user email | `user@example.com` |
| `JIRA_API_TOKEN` | Secret | Jira API token | `ATATT3xFfGF0...` |
| `JIRA_DEFAULT_PROJECT` | Secret | Default project key | `SEC` |

### Optional Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `JIRA_DEFAULT_ISSUE_TYPE` | Variable | `Task` | Issue type for alerts |
| `JIRA_FALLBACK_LABEL` | Variable | `missing-user-story` | Label for no user story |
| `JIRA_SECURITY_LABEL` | Variable | `github-security-alert` | Label for all security issues |

---

## Data Structures

### GitHub Alert Object

```typescript
interface CodeScanningAlert {
  number: number;
  created_at: string;
  url: string;
  html_url: string;
  state: 'open' | 'closed' | 'dismissed' | 'fixed';
  rule: {
    id: string;
    severity: 'note' | 'warning' | 'error';
    security_severity_level: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    name: string;
  };
  most_recent_instance: {
    location: {
      path: string;
      start_line: number;
      end_line: number;
      start_column: number;
      end_column: number;
    };
  };
}
```

---

### Jira Issue Description (Atlassian Document Format)

```typescript
interface JiraDescription {
  type: 'doc';
  version: 1;
  content: Array<{
    type: 'paragraph' | 'heading';
    attrs?: { level: number };
    content: Array<{
      type: 'text';
      text: string;
      marks?: Array<{
        type: 'strong' | 'link';
        attrs?: { href: string };
      }>;
    }>;
  }>;
}
```

---

### Jira Issue Payload

```typescript
interface JiraIssuePayload {
  fields: {
    project: { key: string };
    summary: string;
    description: JiraDescription;
    issuetype: { name: string };
    priority?: { name: string };
    labels: string[];
  };
}
```

---

### Severity to Priority Mapping

```typescript
const severityPriorityMap: Record<string, string> = {
  'critical': 'Highest',
  'high': 'High',
  'medium': 'Medium',
  'low': 'Low',
  'warning': 'Low',
  'note': 'Lowest',
  'error': 'High',
};
```

---

## Error Handling

### GitHub API Errors

```javascript
try {
  const alerts = await fetchCodeScanningAlerts(octokit);
} catch (error) {
  if (error.status === 404) {
    // Code scanning not enabled
  } else if (error.status === 403) {
    // Insufficient permissions
  } else {
    // Other error
  }
}
```

### Jira API Errors

```javascript
try {
  const issue = await createJiraIssue(jiraClient, alert, userStory);
} catch (error) {
  if (error.response?.status === 401) {
    // Authentication failed
  } else if (error.response?.status === 400) {
    // Invalid request (check required fields)
  } else if (error.response?.status === 404) {
    // Project or issue not found
  } else {
    // Other error
  }
}
```

---

## Rate Limiting

### GitHub API Rate Limits

- **Authenticated requests:** 5,000 per hour
- **Code Scanning API:** Same as above
- **Check remaining:** `octokit.rateLimit.get()`

### Jira API Rate Limits

- **Cloud:** Dynamic based on instance size
- **Retry logic:** Exponential backoff (3 retries)
- **Handled automatically** by axios-retry

---

## Testing

### Dry Run Mode

Test the script without creating real Jira issues:

```bash
node create-jira-issues.js --dry-run
```

**Output:**
```
DRY RUN - Would create Jira issue:
{
  "fields": {
    "project": { "key": "SEC" },
    "summary": "[Security Alert] SQL Injection in user.js",
    ...
  }
}
```

---

## Dependencies

### npm Packages

```json
{
  "@octokit/rest": "^20.0.2",
  "axios": "^1.6.2",
  "axios-retry": "^4.0.0"
}
```

### Version Requirements

- **Node.js:** >= 18.0.0
- **npm:** >= 9.0.0

---

## Complete Example

```javascript
// Full workflow example
const { Octokit } = require('@octokit/rest');
const axios = require('axios');

async function processSecurityAlerts() {
  // 1. Initialize clients
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const jiraClient = createJiraClient();
  
  // 2. Fetch PR data
  const commits = await fetchPRCommits(octokit);
  const userStory = findUserStory(process.env.GITHUB_PR_DESCRIPTION, commits);
  
  // 3. Fetch security alerts
  const alerts = await fetchCodeScanningAlerts(octokit);
  
  // 4. Create Jira issues
  for (const alert of alerts) {
    const issue = await createJiraIssue(jiraClient, alert, userStory);
    console.log(`Created: ${issue.key}`);
  }
}
```

---

## Additional Resources

- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Jira REST API v3 Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Octokit.js Documentation](https://octokit.github.io/rest.js/)
- [Axios Documentation](https://axios-http.com/)

---

**Last Updated:** 2024-12-04
