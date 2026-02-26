# GH-JIRA-INTEGRATION

A secure integration between GitHub and JIRA for automated issue synchronization.

## 🔐 Security Features

This repository implements multiple layers of security:

- ✅ **Secret Scanning**: Automated detection of exposed credentials
- ✅ **Dependency Monitoring**: Dependabot for automatic security updates
- ✅ **CodeQL Analysis**: Static code analysis for vulnerability detection
- ✅ **Secure Configuration**: Environment-based credential management
- ✅ **Access Control**: Minimal permission requirements

## 🚀 Quick Start

### Prerequisites

- GitHub Personal Access Token with appropriate scopes
- JIRA API Token
- Node.js 18+ or Python 3.9+ (depending on implementation)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/siddjoshi/GH-JIRA-INTEGRATION.git
   cd GH-JIRA-INTEGRATION
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **IMPORTANT**: Never commit your `.env` file or any credentials to version control.

## 🔑 Configuration

### GitHub Token Setup

1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token with minimal required scopes:
   - `repo` - For accessing repository issues
   - `read:org` - If working with organization repositories

### JIRA API Token Setup

1. Go to JIRA Account Settings → Security → API Tokens
2. Create a new API token
3. Store it securely in your `.env` file

## 🛡️ Security Best Practices

### For Developers

1. **Never commit secrets**: Use `.env` files and environment variables
2. **Scan before commit**: Run `git diff` to review changes before committing
3. **Review dependencies**: Check `npm audit` or `pip-audit` regularly
4. **Use HTTPS**: Always use secure connections for API calls
5. **Validate inputs**: Sanitize all user inputs to prevent injection attacks
6. **Update regularly**: Keep dependencies and actions up to date

### For Users

1. **Protect API tokens**: Store credentials in a secure password manager
2. **Use minimal scopes**: Only grant necessary permissions to tokens
3. **Rotate credentials**: Update API keys and tokens every 90 days
4. **Monitor activity**: Review access logs for suspicious activity
5. **Enable 2FA**: Use two-factor authentication on GitHub and JIRA

## 📋 Security Checklist

Before deploying:

- [ ] All secrets stored in environment variables (not hardcoded)
- [ ] `.env` file added to `.gitignore`
- [ ] Dependabot enabled for automatic security updates
- [ ] CodeQL analysis configured and passing
- [ ] Secret scanning enabled in repository settings
- [ ] Minimal API token scopes configured
- [ ] HTTPS used for all API communications
- [ ] Webhook signatures verified (if using webhooks)
- [ ] Error messages don't expose sensitive information
- [ ] Security policy documented in SECURITY.md

## 🐛 Reporting Security Issues

Please report security vulnerabilities by following the guidelines in [SECURITY.md](SECURITY.md).

**Do not report security issues through public GitHub issues.**

## 📄 License

[Add your license here]

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. Your code passes all security checks
2. No secrets are committed
3. Dependencies are up to date
4. Tests pass locally

## 📚 Documentation

- [Security Policy](SECURITY.md)
- [Environment Variables](.env.example)

## ⚠️ Disclaimer

This integration handles sensitive data from both GitHub and JIRA. Ensure compliance with your organization's security policies and applicable regulations (GDPR, SOC 2, etc.).

---

**Security Contact**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
# GitHub Advanced Security to Jira Cloud Integration

> **Enterprise-grade automation** that creates Jira issues when GitHub Advanced Security alerts are detected in Pull Requests.

[![GitHub Actions](https://img.shields.io/badge/GitHub-Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Jira](https://img.shields.io/badge/Jira-Cloud-0052CC?logo=jira&logoColor=white)](https://www.atlassian.com/software/jira)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [User Story Extraction](#user-story-extraction)
- [Fallback Mechanism](#fallback-mechanism)
- [Jira Issue Format](#jira-issue-format)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)
- [Examples](#examples)
- [FAQ](#faq)
- [API Reference](#api-reference)

---

## 🎯 Overview

This integration automatically creates **Jira issues** when **GitHub Advanced Security** detects security vulnerabilities in pull requests. It provides full traceability by linking security issues to user stories and maintaining bidirectional references between GitHub and Jira.

### Key Capabilities

- ✅ Automatic Jira issue creation for **Code Scanning alerts**
- ✅ Smart user story detection from PR descriptions and commits
- ✅ Fallback to default project when no user story found
- ✅ Full traceability with links to GitHub alerts and PRs
- ✅ Retry logic and error handling for production reliability
- ✅ Least-privileged security model
- ✅ Extensible to Secret Scanning and Dependabot alerts

---

## 🏗️ Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Developer Creates/Updates Pull Request                         │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Advanced Security Scans Code                            │
│  - Code Scanning (CodeQL, other tools)                          │
│  - Secret Scanning                                              │
│  - Dependabot                                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Security Alerts Detected                                       │
│  Workflow Triggered: security-to-jira.yml                       │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Script: create-jira-issues.js                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Fetch PR details (description, commits)                │  │
│  │ 2. Extract user story (PROJ-123) from:                    │  │
│  │    - PR description (highest priority)                    │  │
│  │    - Commit messages (fallback)                           │  │
│  │ 3. Fetch code scanning alerts for PR                      │  │
│  │ 4. For each alert:                                        │  │
│  │    a. Create Jira issue with full details                 │  │
│  │    b. Link to user story (if found)                       │  │
│  │    c. Apply labels and metadata                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Jira Issues Created                                            │
│  - Linked to user story (if found)                              │
│  - Tagged with repository, severity, type                       │
│  - Contains links to GitHub alert and PR                        │
└─────────────────────────────────────────────────────────────────┘
```

### Component Diagram

```
┌──────────────────────┐
│   GitHub Actions     │
│  (Workflow Runner)   │
└──────────┬───────────┘
           │
           │ Triggers on:
           │ - pull_request
           │ - code_scanning_alert
           │
           ▼
┌──────────────────────────────────────┐
│   create-jira-issues.js              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  GitHub API (@octokit/rest)    │  │
│  │  - Fetch PR details            │  │
│  │  - Fetch commits               │  │
│  │  - Fetch security alerts       │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  User Story Extraction         │  │
│  │  - Regex pattern matching      │  │
│  │  - Precedence rules            │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Jira API (axios + retry)      │  │
│  │  - Create issues               │  │
│  │  - Link issues                 │  │
│  │  - Verify user stories         │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│    Jira Cloud        │
│  (Issue Tracker)     │
└──────────────────────┘
```

---

## ✨ Features

### Security Alert Support

| Alert Type | Status | Notes |
|------------|--------|-------|
| **Code Scanning** | ✅ Implemented | CodeQL and third-party tools |
| **Secret Scanning** | 🔄 Future | Easy to extend |
| **Dependabot** | 🔄 Future | Easy to extend |

### User Story Detection

The integration intelligently extracts Jira issue keys from:

1. **PR Description** (highest priority)
2. **Commit Messages** (checked in reverse chronological order)

Supported formats:
- `PROJ-123` - Direct Jira key
- `User Story: PROJ-123` - Explicit marker
- `JIRA: PROJ-123` - Alternative marker
- `Story: PROJ-123` - Another marker
- `[PROJ-123]` - Bracketed format

### Jira Integration Features

- ✅ Automatic issue creation via REST API v3
- ✅ Issue linking to user stories
- ✅ Rich descriptions with Atlassian Document Format
- ✅ Labels for categorization
- ✅ Priority mapping from severity
- ✅ Retry logic with exponential backoff
- ✅ Proper error handling

---

## 📋 Prerequisites

### GitHub Requirements

- GitHub repository with Advanced Security enabled
- GitHub Actions enabled
- Code Scanning configured (e.g., CodeQL)
- Repository write permissions for GitHub Actions

### Jira Requirements

- Jira Cloud instance
- Jira project with appropriate permissions
- API token for authentication
- User account with issue creation permissions

### Technical Requirements

- Node.js 18+ (provided by GitHub Actions runner)

---

## 🚀 Installation

### Step 1: Copy Files to Your Repository

Copy the following files to your repository:

```
your-repo/
├── .github/
│   └── workflows/
│       └── security-to-jira.yml
└── scripts/
    ├── package.json
    └── create-jira-issues.js
```

### Step 2: Install Dependencies

The workflow automatically installs dependencies, but you can test locally:

```bash
cd scripts
npm install
```

### Step 3: Configure GitHub Secrets

Add the following secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `JIRA_BASE_URL` | Your Jira Cloud URL | `https://your-domain.atlassian.net` |
| `JIRA_USER_EMAIL` | Email for Jira authentication | `user@example.com` |
| `JIRA_API_TOKEN` | Jira API token | `ATATT3xFfGF0...` |
| `JIRA_DEFAULT_PROJECT` | Default project key* | `SEC` |

*Note: `JIRA_DEFAULT_PROJECT` is not sensitive data and can alternatively be stored as a repository variable instead of a secret.

#### Creating a Jira API Token

1. Go to [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a descriptive name (e.g., "GitHub Security Integration")
4. Copy the token immediately (you won't see it again)
5. Add it to GitHub Secrets

### Step 4: Configure Variables (Optional)

**Settings → Secrets and variables → Actions → Variables tab**

| Variable Name | Description | Default |
|---------------|-------------|---------|
| `JIRA_DEFAULT_ISSUE_TYPE` | Issue type for security alerts | `Task` |
| `JIRA_FALLBACK_LABEL` | Label when no user story found | `missing-user-story` |
| `JIRA_SECURITY_LABEL` | Label for all security issues | `github-security-alert` |

---

## ⚙️ Configuration

### GitHub Actions Workflow

The workflow is triggered by:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  code_scanning_alert:
    types: [created, reopened]
```

### Permissions (Least-Privilege)

```yaml
permissions:
  pull-requests: read      # Read PR details
  contents: read           # Read commits
  security-events: read    # Read security alerts
```

### Environment Variables

All configuration is done via environment variables and secrets:

```yaml
env:
  # GitHub context (automatic)
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  GITHUB_REPOSITORY: ${{ github.repository }}
  GITHUB_PR_NUMBER: ${{ github.event.pull_request.number }}
  
  # Jira credentials (from secrets)
  JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
  JIRA_USER_EMAIL: ${{ secrets.JIRA_USER_EMAIL }}
  JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
  
  # Jira configuration
  JIRA_DEFAULT_PROJECT: ${{ secrets.JIRA_DEFAULT_PROJECT }}
```

---

## 📖 Usage

### Basic Workflow

1. **Developer creates a PR** with user story reference:
   ```markdown
   ## Description
   Implement login feature
   
   User Story: PROJ-456
   ```

2. **GitHub Advanced Security scans** the code

3. **Security alerts are detected** for the PR

4. **Workflow automatically runs** and creates Jira issues

5. **Developer sees Jira issues** linked to their user story

### Example PR Description

```markdown
# Feature: Add User Authentication

## Description
This PR adds JWT-based authentication to the API.

## User Story
PROJ-789

## Changes
- Added JWT middleware
- Created authentication endpoints
- Updated user model
```

### Example Commit Message

```
feat: add JWT authentication middleware

Implements user authentication using JWT tokens.
Related to user story PROJ-789.
```

---

## 🔍 User Story Extraction

### Extraction Logic

The script uses **precedence rules** to find user stories:

**Priority Order:**
1. PR description (checked first)
2. Commit messages (most recent to oldest)
3. Fallback if none found

### Supported Patterns

The following regex patterns are used:

```javascript
// Direct Jira key
/\b([A-Z][A-Z0-9]+-\d+)\b/g

// Explicit markers
/(?:User Story|JIRA|Story|Issue):\s*([A-Z][A-Z0-9]+-\d+)/gi

// Bracketed format
/\[([A-Z][A-Z0-9]+-\d+)\]/g
```

### Examples of Valid Formats

✅ **Will be detected:**
- `PROJ-123`
- `User Story: PROJ-456`
- `JIRA: ABC-789`
- `Story: XYZ-111`
- `Issue: PROJ-222`
- `[PROJ-333]`
- `Working on PROJ-444 implementation`

❌ **Will NOT be detected:**
- `proj-123` (lowercase)
- `PROJ 123` (missing hyphen)
- `P-1` (too short)

### Verification

Before linking, the script:
1. Extracts the Jira key
2. Verifies the issue exists via Jira API
3. Creates the link (or skips if issue doesn't exist)

---

## 🔄 Fallback Mechanism

### When No User Story is Found

If the script cannot find a valid Jira issue key:

1. **Uses default project** from `JIRA_DEFAULT_PROJECT`
2. **Applies fallback label** (`missing-user-story`)
3. **Logs the fallback** in workflow output

### Example Fallback Issue

```
Project: SEC (default)
Summary: [Security Alert] SQL Injection in user_controller.js
Labels: 
  - github-security-alert
  - missing-user-story  ← Fallback indicator
  - severity-high
  - repo-my-app
  - code-scanning
```

### Best Practices

- **Set up a dedicated security project** for fallback issues
- **Review fallback issues regularly** to ensure proper tagging
- **Train developers** to include user story references
- **Use branch naming conventions** as an additional source

---

## 📄 Jira Issue Format

### Issue Fields

Each created Jira issue includes:

| Field | Content | Example |
|-------|---------|---------|
| **Project** | User story project or default | `PROJ` or `SEC` |
| **Summary** | Alert description + file | `[Security Alert] SQL Injection in user.js` |
| **Description** | Formatted with all details | See below |
| **Issue Type** | Configurable | `Task`, `Bug`, `Sub-task` |
| **Priority** | Mapped from severity | `Highest`, `High`, `Medium`, `Low` |
| **Labels** | Multiple categorization tags | See below |

### Description Format (Atlassian Document Format)

```
## Security Alert Details
Severity: high
Rule: js/sql-injection
Affected File: src/controllers/user_controller.js
Lines: 45-47

## Description
Unsanitized user input is used in SQL query construction...

## Links
GitHub Security Alert: https://github.com/owner/repo/security/code-scanning/123
Pull Request: https://github.com/owner/repo/pull/456

## Repository Information
Repository: owner/repo
Commit SHA: abc123def456
PR Number: #456
```

### Labels

Automatically applied labels:

- `github-security-alert` - All security issues
- `severity-{level}` - Severity level (critical, high, medium, low)
- `repo-{name}` - Repository name
- `code-scanning` - Alert type
- `missing-user-story` - If no user story found (fallback)

### Severity to Priority Mapping

| GitHub Severity | Jira Priority |
|----------------|---------------|
| `critical` | `Highest` |
| `high` | `High` |
| `medium` | `Medium` |
| `low` | `Low` |
| `warning` | `Low` |
| `note` | `Lowest` |
| `error` | `High` |

---

## 🔒 Security Best Practices

### Secrets Management

✅ **DO:**
- Store credentials in GitHub Secrets
- Use API tokens (not passwords)
- Rotate tokens regularly
- Use least-privileged Jira accounts

❌ **DON'T:**
- Hardcode credentials
- Commit secrets to repository
- Share API tokens
- Use admin accounts unnecessarily

### GitHub Actions Security

- **Minimal permissions** in workflow
- **Pin action versions** for reproducibility
- **Audit workflow runs** regularly
- **Restrict who can modify workflows**

### Jira API Security

- **Use HTTPS only** (enforced)
- **Validate SSL certificates** (default)
- **Implement retry limits** (configured)
- **Rate limit awareness** (exponential backoff)

### Network Security

- **TLS 1.2+ required** for Jira API
- **Token-based auth** (Basic Auth over HTTPS)
- **Timeout configuration** (30 seconds)
- **No proxy support** (for security)

---

## 🔧 Troubleshooting

### Common Issues

#### Issue: No Jira issues created

**Possible causes:**
- Code scanning not enabled
- No alerts in PR
- Missing required secrets

**Solution:**
```bash
# Check workflow logs
# Verify secrets are set
# Confirm code scanning is enabled
```

#### Issue: User story not detected

**Possible causes:**
- Incorrect format in PR description
- Typo in Jira key
- Issue doesn't exist in Jira

**Solution:**
- Use exact format: `User Story: PROJ-123`
- Verify issue exists in Jira
- Check workflow logs for extraction details

#### Issue: Jira API authentication failed

**Possible causes:**
- Invalid API token
- Incorrect email address
- Token expired

**Solution:**
1. Generate new API token
2. Update GitHub secret
3. Verify email matches Jira account

#### Issue: Workflow doesn't trigger

**Possible causes:**
- Code scanning not configured
- Workflow file in wrong location
- Permissions too restrictive

**Solution:**
- Verify `.github/workflows/security-to-jira.yml` exists
- Check repository settings
- Review workflow permissions

### Debug Mode

Enable debug logging in GitHub Actions:

**Settings → Secrets and variables → Actions → Variables**

Add variable:
- Name: `ACTIONS_STEP_DEBUG`
- Value: `true`

### Testing Locally

You can test the script locally using dry-run mode:

```bash
cd scripts

# Set environment variables
export GITHUB_TOKEN="your-token"
export GITHUB_REPOSITORY="owner/repo"
export GITHUB_PR_NUMBER="123"
export JIRA_BASE_URL="https://your-domain.atlassian.net"
export JIRA_USER_EMAIL="user@example.com"
export JIRA_API_TOKEN="your-token"
export JIRA_DEFAULT_PROJECT="SEC"

# Run in dry-run mode
node create-jira-issues.js --dry-run
```

---

## 📚 Examples

### Example 1: PR with User Story

**PR Description:**
```markdown
# Add Password Encryption

Encrypts user passwords using bcrypt.

User Story: AUTH-567
```

**Result:**
- User story `AUTH-567` detected
- Jira issues created in `AUTH` project
- Issues linked to `AUTH-567`
- Labels: `github-security-alert`, `severity-medium`, `repo-myapp`, `code-scanning`

### Example 2: PR without User Story

**PR Description:**
```markdown
# Quick Fix

Fixed typo in error message.
```

**Result:**
- No user story detected
- Jira issues created in `SEC` project (default)
- Label added: `missing-user-story`
- Labels: `github-security-alert`, `missing-user-story`, `severity-low`, `repo-myapp`, `code-scanning`

### Example 3: Multiple Alerts

**Scenario:**
- PR modifies 3 files
- Code scanning finds 2 high-severity and 1 medium-severity alert
- PR description includes `PROJ-789`

**Result:**
- 3 Jira issues created in `PROJ` project
- All linked to `PROJ-789`
- Issues prioritized as `High`, `High`, `Medium`

---

## ❓ FAQ

### Q: Can I use this with GitHub Enterprise Server?

**A:** Yes, but you'll need to adjust the GitHub API endpoints. The Octokit client supports custom base URLs.

### Q: Does this work with Jira Server (on-premise)?

**A:** The script uses Jira Cloud REST API v3. For Jira Server, you'd need to adjust the API endpoints and authentication.

### Q: Can I customize the issue type?

**A:** Yes, set the `JIRA_DEFAULT_ISSUE_TYPE` variable to your preferred type (e.g., `Bug`, `Sub-task`).

### Q: What happens if the workflow fails?

**A:** Check the workflow logs in GitHub Actions. Common issues are authentication problems or missing configuration. The script includes detailed logging.

### Q: Can I test without creating real Jira issues?

**A:** Yes, use the `--dry-run` flag when running the script locally.

### Q: How do I extend this to Secret Scanning?

**A:** Add a `secret_scanning_alert` event trigger to the workflow and update the script to handle secret scanning alerts using the GitHub API.

### Q: Can I group multiple alerts into one Jira issue?

**A:** The current implementation creates one issue per alert. You can modify the script to group by severity or file if needed.

### Q: What if my Jira project requires custom fields?

**A:** Modify the `createJiraIssue()` function to add your custom fields to the `issuePayload.fields` object.

---

## 📖 API Reference

### GitHub APIs Used

#### Code Scanning API
```
GET /repos/{owner}/{repo}/code-scanning/alerts
```
- **Documentation:** https://docs.github.com/en/rest/code-scanning
- **Permissions:** `security-events: read`

#### Pull Requests API
```
GET /repos/{owner}/{repo}/pulls/{pull_number}
GET /repos/{owner}/{repo}/pulls/{pull_number}/commits
GET /repos/{owner}/{repo}/pulls/{pull_number}/files
```
- **Documentation:** https://docs.github.com/en/rest/pulls
- **Permissions:** `pull-requests: read`, `contents: read`

### Jira APIs Used

#### Create Issue
```
POST /rest/api/3/issue
```
- **Documentation:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-post
- **Authentication:** Basic Auth (email + API token)

#### Get Issue
```
GET /rest/api/3/issue/{issueIdOrKey}
```
- **Documentation:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get
- **Authentication:** Basic Auth

#### Create Issue Link
```
POST /rest/api/3/issueLink
```
- **Documentation:** https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/#api-rest-api-3-issuelink-post
- **Authentication:** Basic Auth

### Script Exports

The script exports the following functions for testing:

```javascript
const {
  extractJiraKeys,    // Extract Jira keys from text
  findUserStory,      // Find user story from PR and commits
  createJiraIssue,    // Create a Jira issue
  main,               // Main execution function
} = require('./create-jira-issues.js');
```

---

## 🚀 Scalability Considerations

### Performance

- **Parallel processing:** Not implemented (sequential for safety)
- **Rate limiting:** Handled via retry logic
- **Large PRs:** Filters alerts to only affected files
- **Alert volume:** Creates one issue per alert

### Recommendations for Scale

1. **Alert filtering:** Consider grouping alerts by severity or file
2. **Batching:** Implement batch Jira issue creation for high volume
3. **Caching:** Cache Jira project lookups
4. **Webhooks:** Consider using Jira webhooks for bidirectional sync

---

## 🔄 Future Enhancements

- [ ] Support for Secret Scanning alerts
- [ ] Support for Dependabot alerts
- [ ] Automatic issue closure when alerts are resolved
- [ ] Configurable issue grouping strategies
- [ ] Support for Jira Service Management
- [ ] Slack/Teams notifications
- [ ] Custom field mapping configuration file

---

## 📝 License

MIT License - feel free to use and modify for your needs.

---

## 🤝 Contributing

Contributions welcome! Please ensure:
- Code follows existing style
- Documentation is updated
- Security best practices are followed

---

## 📞 Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review [GitHub Actions logs](https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows/using-workflow-run-logs)
3. Consult [Jira API documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)

---

**Built with ❤️ for DevSecOps teams**
