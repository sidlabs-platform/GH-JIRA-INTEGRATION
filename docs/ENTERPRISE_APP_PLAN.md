# Centralized GitHub App: Enterprise Security-to-Jira Integration

## Comprehensive Implementation Plan

**Version**: 1.0  
**Date**: February 27, 2026  
**Status**: Planning  
**Scope**: Hundreds of organizations within a GitHub Enterprise Cloud account

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Enterprise App Feasibility Analysis](#2-enterprise-app-feasibility-analysis)
- [3. Architecture Overview](#3-architecture-overview)
- [4. GitHub App Registration & Configuration](#4-github-app-registration--configuration)
- [5. Webhook Event Handling](#5-webhook-event-handling)
- [6. Hosting Service Design](#6-hosting-service-design)
- [7. Multi-Org Configuration Management](#7-multi-org-configuration-management)
- [8. Security Architecture](#8-security-architecture)
- [9. Scalability & Performance](#9-scalability--performance)
- [10. Observability & Monitoring](#10-observability--monitoring)
- [11. Deployment Strategy](#11-deployment-strategy)
- [12. Migration Path from Per-Repo Workflows](#12-migration-path-from-per-repo-workflows)
- [13. Disaster Recovery & High Availability](#13-disaster-recovery--high-availability)
- [14. Cost Estimation](#14-cost-estimation)
- [15. Implementation Phases & Timeline](#15-implementation-phases--timeline)
- [16. Risk Register](#16-risk-register)
- [17. Appendices](#17-appendices)

---

## 1. Executive Summary

### Problem Statement

The current per-repository GitHub Actions workflow approach requires copying workflow files and scripts into every single repository. At enterprise scale (hundreds of organizations, thousands of repositories), this creates:

- **Maintenance burden**: Updating the integration requires changes across all repos
- **Inconsistent adoption**: Not all repos may have the workflow installed
- **Secret sprawl**: Jira credentials duplicated as secrets in every org/repo
- **No central visibility**: No unified dashboard of security-to-Jira activity
- **Governance gaps**: No enforcement that the integration is installed

### Solution

Build a **centralized GitHub App** registered at the **enterprise level** that:

1. Receives webhook events (`code_scanning_alert`, `secret_scanning_alert`, `dependabot_alert`) from all installed repositories across all organizations
2. Processes alerts and creates Jira issues via a centralized hosting service
3. Manages configuration centrally with per-org overrides
4. Provides a unified operational dashboard

### Why Enterprise App?

| Aspect | Enterprise App | Organization App |
|---|---|---|
| **Registration scope** | Registered once under the enterprise | Must register per-org or as public app |
| **Installation** | Installable on any org within the enterprise | Only on the owning org (private) or any account (public) |
| **Permission changes** | Auto-accepted by enterprise-owned orgs | Requires each org owner to approve |
| **Visibility** | "Only enterprise organizations" | Private or public |
| **Scale for 100s of orgs** | Single registration, install per-org | Requires org-by-org installation + approval |
| **Credential management** | Centralized | Distributed |
| **Verdict** | **Recommended** | Fallback option |

---

## 2. Enterprise App Feasibility Analysis

### Confirmed: Enterprise-Owned GitHub Apps Are Supported

Based on GitHub documentation (Enterprise Cloud):

1. **Registration**: GitHub Apps can be registered under an enterprise account at `Enterprise Settings → Developer Settings → GitHub Apps → New GitHub App`
2. **Scope**: Enterprise-owned apps are restricted to "only enterprise organizations" — they can only be installed on the enterprise itself and organizations within that enterprise
3. **Installation**: Each organization within the enterprise can install the app. An enterprise admin or organization owner performs the installation
4. **Permission propagation**: When an enterprise owner modifies the app's permissions, changes are **automatically accepted** by all organization installations — no per-org approval cycle
5. **Limit**: Up to 100 GitHub Apps per enterprise account (more than sufficient)

### Enterprise App Capabilities Confirmed

| Capability | Supported? | Notes |
|---|---|---|
| Webhook subscriptions | Yes | `code_scanning_alert`, `secret_scanning_alert`, `dependabot_alert` |
| Repository-level permissions | Yes | `security_events: read`, `contents: read`, `pull_requests: write`, `issues: write` |
| Organization-level permissions | Yes | `members: read` (optional for org context) |
| Enterprise-level permissions | Yes | Available for enterprise management tasks |
| Installation access tokens | Yes | Scoped to the installing org's repos |
| Multiple org installations | Yes | Each org installs independently |
| Auto-accept permission changes | Yes | When enterprise owner modifies permissions |

### Decision: **Proceed with Enterprise-Owned GitHub App**

---

## 3. Architecture Overview

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        GitHub Enterprise Cloud                           │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │   Org A      │  │   Org B      │  │   Org N      │    (100s of orgs) │
│  │  ┌────────┐  │  │  ┌────────┐  │  │  ┌────────┐  │                   │
│  │  │ Repo 1 │  │  │  │ Repo 1 │  │  │  │ Repo 1 │  │                   │
│  │  │ Repo 2 │  │  │  │ Repo 2 │  │  │  │ Repo 2 │  │                   │
│  │  │ Repo N │  │  │  │ Repo N │  │  │  │ Repo N │  │                   │
│  │  └────────┘  │  │  └────────┘  │  │  └────────┘  │                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
│         │                 │                 │                             │
│         └─────────────────┼─────────────────┘                            │
│                           │                                              │
│              ┌────────────▼────────────┐                                 │
│              │  Enterprise GitHub App   │                                │
│              │  (Webhook Subscriptions) │                                │
│              └────────────┬────────────┘                                 │
└───────────────────────────┼──────────────────────────────────────────────┘
                            │
                   Webhook Events (HTTPS POST)
                   code_scanning_alert
                   secret_scanning_alert
                   dependabot_alert
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                      Hosting Service (Azure)                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    Azure Front Door / Load Balancer              │     │
│  └────────────────────────────┬────────────────────────────────────┘     │
│                               │                                          │
│  ┌────────────────────────────▼────────────────────────────────────┐     │
│  │              Webhook Receiver (API Layer)                       │     │
│  │  - Signature verification (HMAC-SHA256)                         │     │
│  │  - Request validation & rate limiting                           │     │
│  │  - Event routing                                                │     │
│  └────────────────────────────┬────────────────────────────────────┘     │
│                               │                                          │
│  ┌────────────────────────────▼────────────────────────────────────┐     │
│  │                    Message Queue (Azure Service Bus)             │     │
│  │  - Durable event storage                                        │     │
│  │  - Retry with dead-letter queue                                 │     │
│  │  - Priority queues by severity                                  │     │
│  └────────────────────────────┬────────────────────────────────────┘     │
│                               │                                          │
│  ┌────────────────────────────▼────────────────────────────────────┐     │
│  │              Alert Processor Workers (Auto-scaling)              │     │
│  │  - Fetch alert details from GitHub API                          │     │
│  │  - Extract user story references                                │     │
│  │  - Apply org-specific configuration                             │     │
│  │  - Duplicate detection                                          │     │
│  │  - Create Jira issues                                           │     │
│  │  - Link issues & add remote links                               │     │
│  │  - Post PR comments                                             │     │
│  │  - Send notifications (Slack, Teams)                            │     │
│  └────────────────────────────┬────────────────────────────────────┘     │
│                               │                                          │
│  ┌────────────────────────────▼────────────────────────────────────┐     │
│  │                     Data Stores                                  │     │
│  │  ┌──────────────────┐  ┌──────────────────┐                     │     │
│  │  │  Azure Cosmos DB  │  │  Azure Key Vault  │                    │     │
│  │  │  - Org configs    │  │  - Jira tokens     │                   │     │
│  │  │  - Processing log │  │  - Webhook secret  │                   │     │
│  │  │  - Dedup state    │  │  - App private key │                   │     │
│  │  │  - Audit trail    │  │  - Encryption keys │                   │     │
│  │  └──────────────────┘  └──────────────────┘                     │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    Observability                                 │     │
│  │  - Azure Application Insights (telemetry, traces, metrics)      │     │
│  │  - Azure Monitor (alerts, dashboards)                           │     │
│  │  - Structured JSON logging                                      │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    Admin Portal (Optional)                       │     │
│  │  - Org onboarding / configuration UI                            │     │
│  │  - Processing dashboard                                         │     │
│  │  - Audit log viewer                                             │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │     Jira Cloud           │
              │  (Per-org instances or   │
              │   shared enterprise)     │
              └──────────────────────────┘
```

### Component Interactions Sequence

```
Developer pushes code → GitHub Advanced Security scans →
Security alert created → Webhook fires →
                                         → Hosting service receives webhook →
                                         → Validates signature →
                                         → Enqueues to Service Bus →
                                         → Worker picks up message →
                                         → Loads org config from Cosmos DB →
                                         → Fetches Jira creds from Key Vault →
                                         → Generates installation access token →
                                         → Fetches alert details from GitHub API →
                                         → Extracts user story from PR →
                                         → Checks for duplicates →
                                         → Creates Jira issue →
                                         → Links to user story →
                                         → Posts PR comment →
                                         → Sends Slack/Teams notification →
                                         → Logs to Application Insights
```

---

## 4. GitHub App Registration & Configuration

### Registration Steps

1. Navigate to **Enterprise Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Configure as follows:

### App Settings

| Setting | Value |
|---|---|
| **App Name** | `Enterprise Security to Jira` |
| **Description** | Automatically creates Jira issues when GitHub Advanced Security detects vulnerabilities |
| **Homepage URL** | URL of the admin portal or documentation page |
| **Webhook URL** | `https://security-jira.{your-domain}.com/api/webhooks/github` |
| **Webhook Secret** | Strong random secret (stored in Key Vault) |
| **SSL Verification** | Enabled |

### Required Permissions

#### Repository Permissions

| Permission | Access Level | Reason |
|---|---|---|
| **Code scanning alerts** | Read | Receive `code_scanning_alert` webhooks and fetch alert details |
| **Secret scanning alerts** | Read | Receive `secret_scanning_alert` webhooks and fetch alert details |
| **Dependabot alerts** | Read | Receive `dependabot_alert` webhooks and fetch alert details |
| **Contents** | Read | Read config files (`.github/security-jira-config.yml`) from repos |
| **Pull requests** | Write | Post PR comments with Jira issue links |
| **Issues** | Write | Post PR comments via Issues API |
| **Metadata** | Read | Required for basic repo access (always granted) |

#### Organization Permissions

| Permission | Access Level | Reason |
|---|---|---|
| **Members** | Read | (Optional) Resolve org membership for notifications |

### Webhook Event Subscriptions

| Event | Purpose |
|---|---|
| `code_scanning_alert` | Triggered when CodeQL or third-party SAST tools find vulnerabilities |
| `secret_scanning_alert` | Triggered when secrets/credentials are detected in code |
| `dependabot_alert` | Triggered when vulnerable dependencies are found |
| `installation` | Track when orgs install/uninstall the app |
| `installation_repositories` | Track which repos are added/removed from installation |

### Installation Process

For each organization within the enterprise:

1. An **enterprise admin** or **organization owner** installs the app
2. Choose either **All repositories** or **Selected repositories**
3. The app receives an `installation` webhook event
4. The hosting service auto-provisions org configuration in Cosmos DB
5. The admin completes Jira configuration via the admin portal or config-as-code

### Bulk Installation

For enterprises with hundreds of orgs, automate installation via the GitHub API:

```
POST /orgs/{org}/installations
```

Or use the Enterprise Admin API to manage installations centrally. An installation automation script should be provided as part of the delivery.

---

## 5. Webhook Event Handling

### Webhook Payload Flow

```
GitHub webhook POST
        │
        ▼
┌───────────────────┐
│ 1. Receive POST   │ ← HTTPS endpoint
│    /api/webhooks/  │
│    github          │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 2. Verify HMAC    │ ← X-Hub-Signature-256 header
│    SHA-256         │   Reject if invalid
│    signature       │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 3. Parse event    │ ← X-GitHub-Event header
│    type + action   │   Filter: created, reopened only
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 4. Extract org    │ ← From installation.account.login
│    and repo info   │   in webhook payload
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 5. Respond 202    │ ← Immediate response to GitHub
│    Accepted        │   (must respond within 10 seconds)
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 6. Enqueue to     │ ← Azure Service Bus / Queue
│    message queue   │   Durable processing
└───────────────────┘
```

### Event Payloads to Handle

#### `code_scanning_alert`

```json
{
  "action": "created",           // or "reopened"
  "alert": {
    "number": 42,
    "html_url": "https://github.com/org/repo/security/code-scanning/42",
    "rule": {
      "id": "js/sql-injection",
      "severity": "error",
      "security_severity_level": "high",
      "description": "SQL Injection vulnerability"
    },
    "most_recent_instance": {
      "location": { "path": "src/db.js", "start_line": 15, "end_line": 20 },
      "commit_sha": "abc123..."
    }
  },
  "repository": { "full_name": "org-a/repo-1" },
  "organization": { "login": "org-a" },
  "installation": { "id": 12345 }
}
```

#### `secret_scanning_alert`

```json
{
  "action": "created",
  "alert": {
    "number": 7,
    "html_url": "https://github.com/org/repo/security/secret-scanning/7",
    "secret_type": "github_personal_access_token",
    "secret_type_display_name": "GitHub Personal Access Token"
  },
  "repository": { "full_name": "org-a/repo-1" },
  "organization": { "login": "org-a" },
  "installation": { "id": 12345 }
}
```

#### `dependabot_alert`

```json
{
  "action": "created",
  "alert": {
    "number": 99,
    "html_url": "https://github.com/org/repo/security/dependabot/99",
    "security_advisory": {
      "ghsa_id": "GHSA-xxxx-yyyy-zzzz",
      "cve_id": "CVE-2025-12345",
      "severity": "critical",
      "summary": "Remote code execution in example-lib",
      "description": "..."
    },
    "dependency": {
      "package": { "name": "example-lib" },
      "manifest_path": "package.json"
    }
  },
  "repository": { "full_name": "org-a/repo-1" },
  "organization": { "login": "org-a" },
  "installation": { "id": 12345 }
}
```

### Authentication for GitHub API Calls

The GitHub App uses **installation access tokens** (not personal access tokens):

1. When the app receives a webhook, it includes `installation.id`
2. The service generates a **JWT** using the app's private key
3. Uses the JWT to request an **installation access token** for that specific org installation
4. The installation access token is short-lived (1 hour) and scoped to the org's repos
5. Uses this token for all GitHub API calls (fetching PR details, posting comments, etc.)

This eliminates the need for storing GitHub PATs per-org.

---

## 6. Hosting Service Design

### Technology Stack

| Component | Technology | Justification |
|---|---|---|
| **Runtime** | Node.js 20+ (TypeScript) | Consistent with existing `create-jira-issues.js`, strong async/event ecosystem |
| **API Framework** | Express.js or Fastify | Lightweight, proven webhook handling |
| **Compute** | Azure Container Apps | Auto-scaling, serverless pricing, container-based |
| **Message Queue** | Azure Service Bus | Enterprise-grade, dead-letter queues, sessions, FIFO |
| **Database** | Azure Cosmos DB (NoSQL) | Global distribution, auto-scaling, flexible schema |
| **Secrets Management** | Azure Key Vault | FIPS 140-2, HSM-backed, RBAC integration |
| **API Gateway** | Azure Front Door | Global load balancing, WAF, SSL termination, DDoS protection |
| **Monitoring** | Azure Application Insights | APM, distributed tracing, custom metrics |
| **Logging** | Azure Monitor Logs | Centralized log aggregation, KQL queries |
| **Cache** | Azure Cache for Redis | Installation token caching, rate limit tracking |
| **CI/CD** | GitHub Actions | Dogfooding, consistent with enterprise tooling |
| **IaC** | Bicep + azd | Azure-native IaC |

### Alternative: Serverless Option

For lower initial cost, the API layer + workers could use **Azure Functions** instead of Container Apps:

| Component | Serverless Alternative |
|---|---|
| Webhook receiver | Azure Functions (HTTP trigger) |
| Alert processor | Azure Functions (Service Bus trigger) |
| Scheduled tasks | Azure Functions (Timer trigger) |

Trade-off: Serverless is cheaper at low volume but has cold-start latency and more complex local development. Container Apps is recommended for enterprise scale.

### Service Architecture (Detailed)

```
src/
├── api/
│   ├── webhooks/
│   │   ├── github.ts              # Webhook receiver endpoint
│   │   ├── signature.ts           # HMAC-SHA256 verification
│   │   └── router.ts              # Event routing
│   ├── admin/
│   │   ├── config.ts              # Org config CRUD API
│   │   ├── health.ts              # Health check endpoint
│   │   └── dashboard.ts           # Dashboard data API
│   └── middleware/
│       ├── auth.ts                # Admin API authentication
│       ├── rate-limit.ts          # Rate limiting
│       └── error-handler.ts       # Global error handling
├── workers/
│   ├── alert-processor.ts         # Service Bus message handler
│   ├── code-scanning.ts           # Code scanning alert processor
│   ├── secret-scanning.ts         # Secret scanning alert processor
│   ├── dependabot.ts              # Dependabot alert processor
│   └── notification.ts            # Slack/Teams notification sender
├── services/
│   ├── github/
│   │   ├── auth.ts                # JWT + installation token generation
│   │   ├── client.ts              # GitHub API client (Octokit)
│   │   ├── pr-service.ts          # PR details, commits, comments
│   │   └── alert-service.ts       # Alert detail fetching
│   ├── jira/
│   │   ├── client.ts              # Jira API client (axios + retry)
│   │   ├── issue-service.ts       # Issue creation, linking, remote links
│   │   ├── dedup-service.ts       # Duplicate detection
│   │   └── epic-resolver.ts       # EPIC hierarchy traversal
│   ├── config/
│   │   ├── org-config.ts          # Org configuration loader
│   │   ├── defaults.ts            # Default configuration values
│   │   └── repo-config.ts         # Per-repo config overrides
│   └── notification/
│       ├── slack.ts               # Slack webhook notifications
│       └── teams.ts               # Teams webhook notifications
├── models/
│   ├── org-config.ts              # Org configuration schema
│   ├── processing-log.ts          # Processing log entry schema
│   └── alert.ts                   # Normalized alert model
├── utils/
│   ├── jira-key-extractor.ts      # User story extraction (from existing code)
│   ├── sanitization.ts            # Input sanitization (from existing code)
│   ├── severity.ts                # Severity mapping and filtering
│   └── logger.ts                  # Structured JSON logger
├── config/
│   ├── app-config.ts              # Application configuration
│   └── defaults.yml               # Default org configuration template
├── tests/
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── e2e/                       # End-to-end tests
├── infra/
│   ├── main.bicep                 # Azure infrastructure
│   ├── modules/                   # Bicep modules
│   └── parameters/                # Environment-specific parameters
├── Dockerfile
├── docker-compose.yml             # Local development
├── azure.yaml                     # azd configuration
├── package.json
└── tsconfig.json
```

### Webhook Processing Pipeline

```typescript
// Pseudocode for the webhook handler

app.post('/api/webhooks/github', async (req, res) => {
  // 1. Verify webhook signature (HMAC-SHA256)
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }

  // 2. Parse event
  const event = req.headers['x-github-event'];
  const action = req.body.action;

  // 3. Filter to relevant events
  if (!['code_scanning_alert', 'secret_scanning_alert', 'dependabot_alert'].includes(event)) {
    return res.status(200).send('Event not relevant');
  }
  if (!['created', 'reopened'].includes(action)) {
    return res.status(200).send('Action not relevant');
  }

  // 4. Enqueue for async processing (respond fast to GitHub)
  await serviceBus.sendMessage({
    body: {
      event,
      action,
      payload: req.body,
      receivedAt: new Date().toISOString(),
    },
    // Priority queue: critical/high alerts go first
    applicationProperties: {
      severity: extractSeverity(event, req.body),
      org: req.body.organization?.login,
    },
  });

  // 5. Respond immediately
  return res.status(202).send('Accepted');
});
```

### Worker Processing Pipeline

```typescript
// Pseudocode for the Service Bus worker

async function processAlert(message) {
  const { event, payload } = message.body;
  const org = payload.organization.login;
  const repo = payload.repository.full_name;
  const installationId = payload.installation.id;

  // 1. Load org configuration
  const orgConfig = await configService.getOrgConfig(org);
  if (!orgConfig.enabled) {
    log('info', `Org ${org} is disabled, skipping`);
    return;
  }

  // 2. Check alert type enabled + severity threshold
  const alertType = getAlertType(event);
  if (!orgConfig.alerts[alertType].enabled) return;

  const normalized = normalizeAlert(event, payload.alert);
  if (!meetsSeverityThreshold(normalized.severity, orgConfig.alerts[alertType].threshold)) return;

  // 3. Generate installation access token for GitHub API
  const githubToken = await githubAuth.getInstallationToken(installationId);
  const octokit = new Octokit({ auth: githubToken });

  // 4. Get Jira credentials from Key Vault
  const jiraCreds = await keyVault.getJiraCredentials(orgConfig.jira.credentialRef);

  // 5. Check for duplicates
  const jiraClient = createJiraClient(jiraCreds);
  const duplicate = await checkForDuplicate(jiraClient, normalized, repo, orgConfig);
  if (duplicate) {
    log('info', `Duplicate detected: ${duplicate}`);
    return;
  }

  // 6. Find associated PR and extract user story
  const pr = await findAssociatedPR(octokit, normalized, repo);
  let userStory = null;
  if (pr) {
    const commits = await fetchPRCommits(octokit, repo, pr.number);
    userStory = findUserStory(pr.body, commits);
  }

  // 7. Resolve EPIC if configured
  if (userStory && orgConfig.epicResolution.enabled) {
    userStory = await resolveEpic(jiraClient, userStory, orgConfig);
  }

  // 8. Create Jira issue
  const issue = await createJiraIssue(jiraClient, normalized, userStory, orgConfig, repo, pr);

  // 9. Link to user story, create remote link
  if (userStory) await linkJiraIssues(jiraClient, issue.key, userStory, orgConfig);
  await createRemoteLink(jiraClient, issue.key, normalized.html_url);

  // 10. Post PR comment
  if (pr && orgConfig.notifications.prComment.enabled) {
    await postPRComment(octokit, repo, pr.number, issue.key);
  }

  // 11. Send notifications
  await sendNotifications(orgConfig, normalized, issue);

  // 12. Log to audit trail
  await auditLog.record({ org, repo, alert: normalized, issue: issue.key });
}
```

---

## 7. Multi-Org Configuration Management

### Configuration Hierarchy

```
Enterprise Defaults (built into the service)
    └── Org-Level Config (stored in Cosmos DB, managed via admin portal or API)
        └── Repo-Level Overrides (optional, from .github/security-jira-config.yml in each repo)
```

### Cosmos DB Configuration Schema

```json
{
  "id": "org-acme-corp",
  "partitionKey": "org-config",
  "org": "acme-corp",
  "enabled": true,
  "installationId": 12345,
  "createdAt": "2026-01-15T00:00:00Z",
  "updatedAt": "2026-02-27T00:00:00Z",

  "jira": {
    "credentialRef": "jira-acme-corp",
    "baseUrl": "https://acme-corp.atlassian.net",
    "defaultProject": "SEC",
    "defaultIssueType": "Bug",
    "linkType": "Relates",
    "securityLabel": "github-security-alert",
    "fallbackLabel": "missing-user-story"
  },

  "alerts": {
    "code_scanning": { "enabled": true, "severityThreshold": "medium" },
    "secret_scanning": { "enabled": true, "severityThreshold": "low" },
    "dependabot": { "enabled": true, "severityThreshold": "high" }
  },

  "epicResolution": {
    "enabled": true,
    "validateType": true,
    "traverseHierarchy": true,
    "acceptedTypes": ["Epic", "Story"]
  },

  "notifications": {
    "prComment": { "enabled": true, "onMissingEpic": true },
    "slack": { "enabled": true, "webhookRef": "slack-acme-corp" },
    "teams": { "enabled": false, "webhookRef": "" }
  },

  "repoOverrides": {
    "acme-corp/critical-service": {
      "alerts": {
        "code_scanning": { "severityThreshold": "low" }
      },
      "jira": { "defaultProject": "CRIT" }
    }
  }
}
```

### Jira Credential Storage in Key Vault

Each org's Jira credentials are stored as separate Key Vault secrets:

```
Secret Name: jira-acme-corp
Value: {
  "userEmail": "security-bot@acme-corp.com",
  "apiToken": "ATATT3xFfGF0..."
}
```

This allows:
- Different Jira instances per org
- Independent credential rotation per org
- Audit trail of secret access via Key Vault logs

### Config-as-Code Support

Orgs can optionally place a `.github/security-jira-config.yml` in their org-level `.github` repository or individual repos. The worker reads this file (via GitHub Contents API using the installation token) and merges it with the centralized config:

```yaml
# .github/security-jira-config.yml (in the org's .github repo)
jira:
  default_project: SECOPS
  default_issue_type: Task

alerts:
  code_scanning:
    severity_threshold: medium
  dependabot:
    enabled: false
```

**Precedence**: Repo config > Org config (Cosmos DB) > Enterprise defaults

---

## 8. Security Architecture

### Authentication & Authorization

| Component | Mechanism |
|---|---|
| **GitHub → Service** | Webhook HMAC-SHA256 signature verification |
| **Service → GitHub API** | Installation access tokens (short-lived, auto-rotated) |
| **Service → Jira API** | API token (stored in Key Vault, Basic Auth) |
| **Admin API** | Microsoft Entra ID (Azure AD) with RBAC |
| **Key Vault access** | Managed Identity (no credentials in code) |
| **Cosmos DB access** | Managed Identity |
| **Service Bus access** | Managed Identity |

### Webhook Signature Verification

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

### Defense-in-Depth Layers

1. **Azure Front Door WAF**: DDoS protection, OWASP rule set, IP filtering
2. **Webhook signature verification**: Reject unauthorized payloads
3. **Input sanitization**: All alert data sanitized before use (reuse existing sanitization functions)
4. **Managed Identity**: No credentials in code or config files
5. **Key Vault**: All secrets HSM-protected, access logged
6. **Network isolation**: VNet integration for Container Apps, private endpoints for PaaS services
7. **TLS everywhere**: Encrypted in transit for all connections
8. **Cosmos DB encryption**: Encrypted at rest with Microsoft-managed or customer-managed keys
9. **RBAC**: Least-privilege access for all service identities

### Network Architecture

```
Internet (GitHub Webhooks)
        │
        ▼
┌───────────────────┐
│  Azure Front Door │  ← WAF, DDoS protection, SSL termination
│  (Global LB)      │
└────────┬──────────┘
         │ (Private link / VNet integration)
         ▼
┌───────────────────┐
│  Container Apps   │  ← VNet-integrated
│  Environment      │
└────────┬──────────┘
         │ (Private endpoints)
         ├──► Azure Service Bus
         ├──► Azure Cosmos DB
         ├──► Azure Key Vault
         └──► Azure Cache for Redis
```

### Secret Rotation Strategy

| Secret | Rotation Frequency | Method |
|---|---|---|
| GitHub App private key | Annually | Manual rotation, update in Key Vault |
| Webhook secret | Annually | Rotate in GitHub App settings + Key Vault simultaneously |
| Jira API tokens | Every 90 days | Per-org rotation via admin portal, stored in Key Vault |
| Managed Identity | Automatic | Azure-managed, no manual rotation needed |

---

## 9. Scalability & Performance

### Capacity Planning

| Metric | Estimate (for 100s of orgs) |
|---|---|
| Orgs | 200-500 |
| Repos per org (avg) | 50-200 |
| Total repos | 10,000-100,000 |
| Security alerts/day (avg) | 500-5,000 |
| Peak alerts/hour | 1,000-2,000 |
| Jira issues created/day | 200-2,000 (after dedup + severity filtering) |

### Auto-Scaling Strategy

| Component | Min | Max | Scale Trigger |
|---|---|---|---|
| Webhook receiver | 2 replicas | 10 replicas | CPU > 60% or concurrent requests > 100 |
| Alert processor workers | 2 replicas | 20 replicas | Service Bus queue depth > 50 |
| Redis cache | 1 instance | 1 instance | Fixed (C1 or C2 tier) |

### Performance Targets

| Metric | Target | Notes |
|---|---|---|
| Webhook response time | < 500ms | Must respond to GitHub within 10s |
| End-to-end processing | < 60s | From webhook receipt to Jira issue created |
| Throughput | 100 alerts/minute | Sustained processing rate |
| GitHub API rate limit | 5,000 req/hr per installation | Managed via token caching + request batching |
| Jira API rate limit | Varies by plan | Managed via retry with exponential backoff |

### Rate Limit Management

- **GitHub API**: Each installation token has its own 5,000 req/hr limit. With hundreds of orgs, rate limits are distributed naturally. Cache installation tokens in Redis (valid for 1 hour).
- **Jira API**: Use organization-level rate limit tracking. If an org's Jira instance is rate-limited, back off that org's queue while continuing to process others.

### Message Queue Design

```
Azure Service Bus Namespace
├── Queue: alerts-critical     (priority processing, TTL: 24h)
├── Queue: alerts-high         (standard processing, TTL: 48h)
├── Queue: alerts-medium       (standard processing, TTL: 72h)
├── Queue: alerts-low          (batch processing, TTL: 7d)
├── Queue: notifications       (Slack/Teams notifications)
├── Topic: audit-events        (fan-out to audit subscribers)
└── Queue: dead-letter         (failed messages for investigation)
```

---

## 10. Observability & Monitoring

### Metrics to Track

| Category | Metric | Alert Threshold |
|---|---|---|
| **Webhook** | Webhooks received/minute | > 500/min (unusual spike) |
| **Webhook** | Signature verification failures | > 10/hour |
| **Processing** | Queue depth | > 200 messages |
| **Processing** | Processing latency (p95) | > 120 seconds |
| **Processing** | Error rate | > 5% |
| **Jira** | Issues created/hour | Informational |
| **Jira** | API error rate | > 10% |
| **Jira** | Duplicates skipped | Informational |
| **GitHub** | API rate limit remaining | < 500 remaining |
| **System** | CPU utilization | > 80% sustained |
| **System** | Memory utilization | > 85% |

### Dashboard Views

1. **Executive Dashboard**: Total alerts processed, Jira issues created, by org, by severity, trend over time
2. **Operations Dashboard**: Queue depth, processing latency, error rate, active workers, API rate limits
3. **Per-Org Dashboard**: Alerts per repo, Jira issues created, configuration status, credential expiry
4. **Audit Dashboard**: Full processing audit trail, searchable by org/repo/alert type

### Alerting

| Alert | Severity | Channel |
|---|---|---|
| Webhook endpoint down | Critical | PagerDuty / On-call |
| Queue depth > 500 | High | Slack #ops |
| Jira API errors > 10% | High | Slack #ops + email |
| Signature verification failures spike | Critical | PagerDuty + Slack #security |
| Credential expiring in < 14 days | Medium | Email to org admin |

### Structured Logging Format

```json
{
  "timestamp": "2026-02-27T10:30:00.000Z",
  "level": "info",
  "service": "security-jira-app",
  "component": "alert-processor",
  "correlationId": "uuid-v4",
  "org": "acme-corp",
  "repo": "acme-corp/web-app",
  "alertType": "code_scanning",
  "alertNumber": 42,
  "action": "jira_issue_created",
  "jiraKey": "SEC-456",
  "durationMs": 1250,
  "message": "Created Jira issue SEC-456 for code scanning alert #42"
}
```

---

## 11. Deployment Strategy

### Infrastructure as Code (Bicep)

All Azure resources defined in Bicep modules:

```
infra/
├── main.bicep                     # Main orchestrator
├── parameters/
│   ├── dev.bicepparam             # Dev environment
│   ├── staging.bicepparam         # Staging environment
│   └── prod.bicepparam            # Production environment
├── modules/
│   ├── container-apps.bicep       # Container Apps environment + apps
│   ├── service-bus.bicep          # Service Bus namespace + queues
│   ├── cosmos-db.bicep            # Cosmos DB account + database + containers
│   ├── key-vault.bicep            # Key Vault + access policies
│   ├── redis.bicep                # Redis cache
│   ├── front-door.bicep           # Front Door + WAF
│   ├── app-insights.bicep         # Application Insights + Log Analytics
│   ├── managed-identity.bicep     # User-assigned managed identity
│   └── networking.bicep           # VNet, subnets, private endpoints
└── azure.yaml                     # azd project configuration
```

### Environment Promotion

```
Feature Branch → Dev → Staging → Production

Dev:
  - Single replica per service
  - Shared Cosmos DB (separate database)
  - Separate GitHub App registration (test enterprise)
  - Test Jira Cloud instance

Staging:
  - Production-like configuration
  - Connected to a subset of real orgs
  - Production Jira (staging project)

Production:
  - Full auto-scaling
  - All orgs connected
  - Geo-redundant Cosmos DB
  - Multi-region Front Door
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy Security-to-Jira Service

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
      - run: npm run lint

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
      - run: azd deploy --environment staging

  deploy-prod:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
      - run: azd deploy --environment production
```

---

## 12. Migration Path from Per-Repo Workflows

### Phase 1: Parallel Running

1. Deploy the centralized app and install on a pilot org
2. Keep existing per-repo workflows running
3. Compare output: both should create the same Jira issues
4. Validate duplicate detection handles duplicates from both sources

### Phase 2: Gradual Rollout

1. Install the app on additional orgs (batch of 10-20 at a time)
2. For each org, verify Jira issues are created correctly
3. Disable per-repo workflows in migrated orgs via PR

### Phase 3: Full Migration

1. Install on all remaining orgs
2. Remove per-repo workflow files across all repos (automated via script or PR)
3. Decommission per-repo GitHub secrets (Jira tokens)

### Migration Script

A script will be provided to:

1. List all repos with the old workflow file
2. Create PRs to remove `.github/workflows/security-to-jira.yml` and `scripts/` directory
3. Verify the centralized app is processing alerts for each repo
4. Report migration status across the enterprise

---

## 13. Disaster Recovery & High Availability

### RPO/RTO Targets

| Metric | Target |
|---|---|
| **RPO** (Recovery Point Objective) | 0 (no data loss - events are in Service Bus) |
| **RTO** (Recovery Time Objective) | < 15 minutes |

### High Availability Design

| Component | HA Strategy |
|---|---|
| **Container Apps** | Min 2 replicas, zone-redundant |
| **Service Bus** | Premium tier with zone redundancy, geo-disaster recovery pairing |
| **Cosmos DB** | Multi-region writes, automatic failover |
| **Key Vault** | Zone-redundant, soft delete enabled |
| **Redis Cache** | Zone-redundant replicas |
| **Front Door** | Global anycast, automatic backend health probes |

### Failure Scenarios

| Scenario | Impact | Recovery |
|---|---|---|
| Webhook receiver down | Webhooks queue in GitHub (retries for 3 days) | Auto-heal via Container Apps, scale out |
| Worker crashes | Messages remain in Service Bus queue | Auto-restart, dead-letter after 10 retries |
| Jira API unavailable | Issues not created | Service Bus retries with backoff, alerts in dashboard |
| Cosmos DB unavailable | Can't load org config | Failover to secondary region, cached configs in Redis |
| Key Vault unavailable | Can't fetch credentials | Cached credentials in memory (short TTL), failover region |

### Backup Strategy

| Data | Backup | Retention |
|---|---|---|
| Cosmos DB (configs, audit logs) | Continuous backup with point-in-time restore | 30 days |
| Key Vault secrets | Soft delete + purge protection | 90 days |
| Service Bus messages | Geo-disaster recovery pairing | N/A (transient) |

---

## 14. Cost Estimation

### Monthly Cost Estimate (Production)

| Component | SKU | Estimated Monthly Cost (USD) |
|---|---|---|
| Azure Container Apps | Consumption plan, 2-10 replicas | $100-400 |
| Azure Service Bus | Premium (1 MU, zone-redundant) | $670 |
| Azure Cosmos DB | Serverless or 400 RU/s provisioned | $25-200 |
| Azure Key Vault | Standard, ~1000 operations/day | $5-10 |
| Azure Cache for Redis | C1 Standard | $80 |
| Azure Front Door | Standard tier | $35 + per-request |
| Azure Application Insights | ~5 GB/month ingestion | $12 |
| Azure Monitor | Log Analytics, 5 GB/month | $12 |
| **Total (estimated)** | | **$950-1,400/month** |

### Cost Optimization Options

- Use **Service Bus Standard** instead of Premium (saves ~$600/month, loses zone redundancy)
- Use **Cosmos DB Serverless** for low-throughput scenarios
- Use **Azure Functions Consumption** instead of Container Apps (saves ~$50-300/month)
- Reduced estimate with optimizations: **$200-500/month**

### Cost vs. Current Approach

| Approach | Cost Model |
|---|---|
| Per-repo GitHub Actions | GitHub Actions minutes (free for public repos, metered for private) |
| Centralized App | Fixed Azure infrastructure cost + small per-event cost |

For enterprises with 1000+ private repos, the centralized app is more cost-effective due to eliminating redundant workflow runs.

---

## 15. Implementation Phases & Timeline

### Phase 1: Foundation (Weeks 1-3)

- [ ] Register enterprise-owned GitHub App
- [ ] Set up Azure infrastructure (Bicep templates)
- [ ] Implement webhook receiver with signature verification
- [ ] Implement Service Bus integration
- [ ] Set up Key Vault and Managed Identity
- [ ] Set up CI/CD pipeline
- [ ] Basic health check and monitoring

**Deliverables**: Working webhook receiver that accepts and queues events

### Phase 2: Core Processing (Weeks 4-6)

- [ ] Port `create-jira-issues.js` logic to TypeScript service
- [ ] Implement alert normalization for all 3 alert types
- [ ] Implement GitHub App authentication (JWT + installation tokens)
- [ ] Implement Jira issue creation with all fields
- [ ] Implement user story extraction (reuse existing regex logic)
- [ ] Implement duplicate detection
- [ ] Implement issue linking and remote links
- [ ] Implement severity filtering
- [ ] Unit tests (target 80%+ coverage)

**Deliverables**: End-to-end alert processing for a single org

### Phase 3: Multi-Org & Configuration (Weeks 7-9)

- [ ] Implement Cosmos DB configuration store
- [ ] Build org config management API (CRUD)
- [ ] Implement configuration hierarchy (enterprise > org > repo)
- [ ] Implement per-org Jira credential management via Key Vault
- [ ] Implement EPIC resolution
- [ ] Implement PR comments and labels
- [ ] Config-as-code support (read `.github/security-jira-config.yml`)
- [ ] Integration tests

**Deliverables**: Multi-org support with per-org configuration

### Phase 4: Notifications & Observability (Weeks 10-11)

- [ ] Implement Slack notifications
- [ ] Implement Teams notifications
- [ ] Set up Application Insights telemetry
- [ ] Build operational dashboard (Azure Workbooks or Grafana)
- [ ] Set up alerting (PagerDuty/email/Slack)
- [ ] Implement audit logging
- [ ] Performance testing

**Deliverables**: Full observability and notification capabilities

### Phase 5: Admin Portal & Hardening (Weeks 12-14)

- [ ] Build admin portal UI (optional — could be API-only)
- [ ] Implement org onboarding wizard
- [ ] Security hardening (penetration testing, WAF tuning)
- [ ] Load testing (simulate 5,000 alerts/hour)
- [ ] Documentation (operator guide, org onboarding guide)
- [ ] Migration scripts from per-repo workflows
- [ ] Runbook for on-call operations

**Deliverables**: Production-ready service with documentation

### Phase 6: Pilot & Rollout (Weeks 15-18)

- [ ] Pilot with 3-5 orgs
- [ ] Gather feedback, iterate
- [ ] Gradual rollout to all orgs (batches of 20-50)
- [ ] Remove per-repo workflows from migrated repos
- [ ] Monitor and stabilize

**Deliverables**: Full enterprise deployment

---

## 16. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | GitHub webhook delivery failures | Low | Medium | GitHub retries webhooks for 3 days; monitoring on webhook receipt rate |
| 2 | Jira API rate limiting at scale | Medium | Medium | Per-org rate limit tracking, backoff queues, batch processing |
| 3 | GitHub App installation rejected by org owners | Low | High | Enterprise admin push installation; clear communication plan |
| 4 | Credential rotation disrupts service | Medium | High | Key Vault-based rotation with monitoring; grace period for old tokens |
| 5 | Webhook secret compromise | Low | Critical | Rotate immediately; WAF IP allowlisting for GitHub webhook IPs |
| 6 | Cosmos DB performance degradation | Low | Medium | Serverless auto-scaling; partition key design review |
| 7 | Service Bus queue backlog under burst | Medium | Medium | Priority queues; auto-scaling workers; alerts on depth |
| 8 | Different orgs using different Jira instances | Expected | Low | Architecture supports per-org Jira config by design |
| 9 | Some orgs wanting to opt-out | Expected | Low | Per-org `enabled` flag in config |
| 10 | GitHub App permissions too broad | Low | Medium | Minimum required permissions documented and reviewed |
| 11 | Cold start latency (if using Azure Functions) | Medium | Low | Use Container Apps or Functions Premium plan |
| 12 | Enterprise app limit (100 apps) | Very Low | Low | Only 1 app needed; well within limits |

---

## 17. Appendices

### Appendix A: GitHub App vs Organization App — Decision Matrix

| Criterion | Enterprise App | Org App (Private) | Org App (Public) |
|---|---|---|---|
| Registration location | Enterprise account | Single org | Single org |
| Installable on | Enterprise orgs only | Owning org only | Any GitHub account |
| Installation by | Enterprise admin or org owner | Org owner | Any account owner |
| Permission changes | Auto-accepted for enterprise orgs | Requires org owner approval | Requires each installer approval |
| Credential management | Centralized | Per-org | Per-org |
| Suitable for 100s of orgs | **Yes** | No (one org only) | Possible but less controlled |
| Security boundary | Enterprise-controlled | Org-controlled | Open to external |
| **Recommendation** | **Selected** | Not suitable | Not recommended for internal use |

### Appendix B: Required GitHub Webhook IPs

The service's network security should allowlist GitHub's webhook delivery IP ranges. These can be retrieved dynamically via:

```
GET https://api.github.com/meta
→ response.hooks[] contains the IP ranges
```

Consider automating NSG/WAF rule updates from this endpoint.

### Appendix C: Jira Cloud API Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `/rest/api/3/issue` | POST | Create Jira issue |
| `/rest/api/3/issue/{issueKey}` | GET | Verify issue exists, get type for EPIC resolution |
| `/rest/api/3/issueLink` | POST | Link security issue to user story |
| `/rest/api/3/issue/{issueKey}/remotelink` | POST | Create bidirectional remote link |
| `/rest/api/3/search` | GET | JQL search for duplicate detection |

### Appendix D: Supported User Story Formats

Inherited from the existing `create-jira-issues.js`:

| Format | Example | Regex |
|---|---|---|
| Direct key | `PROJ-123` | `\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\b` |
| User Story marker | `User Story: PROJ-123` | `(?:User Story\|JIRA\|Story\|Issue):\s*([...])` |
| Bracketed | `[PROJ-123]` | `\[([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\]` |
| Multi-hyphen | `SUB-PROJ-123` | Supported by all patterns above |

### Appendix E: Azure Resource Naming Convention

```
Resource Group:    rg-security-jira-{env}
Container App:     ca-security-jira-{env}
Service Bus:       sb-security-jira-{env}
Cosmos DB:         cosmos-security-jira-{env}
Key Vault:         kv-secjira-{env}
Redis:             redis-security-jira-{env}
Front Door:        fd-security-jira-{env}
App Insights:      ai-security-jira-{env}
Log Analytics:     log-security-jira-{env}
Managed Identity:  id-security-jira-{env}
VNet:              vnet-security-jira-{env}
```

### Appendix F: Comparison with Alternative Approaches

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Per-repo GitHub Actions** (current) | No infra to manage, simple setup | Doesn't scale, secret sprawl, no central visibility | Not suitable for enterprise |
| **Reusable workflow + caller** | Centralized logic, per-repo thin caller | Still requires a file in every repo, secrets per-org | Better than current, not ideal |
| **Organization webhooks** | No files in repos | Must configure per-org, no enterprise-wide management | Medium complexity |
| **Enterprise GitHub App** (proposed) | Single registration, auto-permission propagation, centralized | Requires hosting service | **Recommended** |
| **GitHub App (public)** | Single registration, installable anywhere | Less control, visible to external accounts | Not recommended for internal |

---

## Summary

The **enterprise-owned GitHub App** approach is confirmed feasible and is the recommended path for enterprise-scale deployment. It provides:

- **Single registration** under the enterprise account
- **Automatic installation** across all organizations
- **Centralized credential management** (no per-repo/per-org secret sprawl)
- **Auto-propagating permission changes** (enterprise owner controls)
- **Unified operations** via a central hosting service with full observability
- **Per-org configurability** for Jira instances, severity thresholds, and notification preferences

The hosting service on Azure provides the durability, scalability, and security required for processing thousands of security alerts daily across the enterprise.
