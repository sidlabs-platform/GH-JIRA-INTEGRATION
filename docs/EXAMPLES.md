# Example Configurations

This directory contains example configurations and templates for using the GitHub Advanced Security to Jira integration.

## 📋 PR Description Templates

### Template 1: Feature Development

```markdown
# Feature: [Feature Name]

## Description
[Brief description of what this PR does]

## User Story
[JIRA-KEY]

## Changes
- [Change 1]
- [Change 2]
- [Change 3]

## Testing
- [How to test these changes]

## Screenshots (if applicable)
[Add screenshots here]
```

### Template 2: Bug Fix

```markdown
# Bug Fix: [Bug Description]

## Issue
Fixes issue described in JIRA-123

## Root Cause
[Explain what caused the bug]

## Solution
[Explain how you fixed it]

## Related Story
Story: JIRA-456
```

### Template 3: Security Fix

```markdown
# Security: [Security Issue]

## Description
Addresses security vulnerability in [component]

## Severity
[Critical/High/Medium/Low]

## Related User Story
User Story: PROJ-789

## Changes
- [Security fix details]
```

---

## 💬 Commit Message Examples

### Example 1: With User Story Reference

```
feat: add input validation for user registration

Implements server-side validation for all user input fields
to prevent XSS and SQL injection attacks.

User Story: AUTH-123
```

### Example 2: Alternative Format

```
fix: sanitize database queries in search endpoint

Fixes SQL injection vulnerability in search functionality.
Related to PROJ-456.
```

### Example 3: Bracketed Format

```
refactor: update authentication middleware [SECURITY-789]

Improves security of JWT token validation.
```

---

## ⚙️ GitHub Secrets Configuration

### Required Secrets

Add these in **Settings → Secrets and variables → Actions → Secrets**:

```bash
# Jira Base URL
# Example: https://your-company.atlassian.net
JIRA_BASE_URL=https://example.atlassian.net

# Jira User Email
# The email address associated with your Jira account
JIRA_USER_EMAIL=devops@example.com

# Jira API Token
# Generate at: https://id.atlassian.com/manage-profile/security/api-tokens
JIRA_API_TOKEN=ATATT3xFfGF0...

# Default Jira Project Key
# Used when no user story is found
JIRA_DEFAULT_PROJECT=SEC
```

### Optional Variables

Add these in **Settings → Secrets and variables → Actions → Variables**:

```bash
# Issue type for security alerts (default: Task)
JIRA_DEFAULT_ISSUE_TYPE=Bug

# Label applied when no user story found (default: missing-user-story)
JIRA_FALLBACK_LABEL=no-user-story

# Label applied to all security issues (default: github-security-alert)
JIRA_SECURITY_LABEL=security-alert
```

---

## 🎯 Example Scenarios

### Scenario 1: Standard Feature Development

**Developer creates PR:**
```markdown
# Feature: User Profile Page

## Description
Implements the user profile page with avatar upload.

User Story: WEB-234

## Changes
- Created profile component
- Added avatar upload functionality
- Implemented profile update API
```

**Code scanning finds:**
- Path traversal in file upload (High severity)
- XSS in profile display (Medium severity)

**Result:**
- 2 Jira issues created in project `WEB`
- Both linked to `WEB-234`
- Labels: `github-security-alert`, `severity-high`, `severity-medium`, `repo-myapp`, `code-scanning`

---

### Scenario 2: Hotfix without User Story

**Developer creates PR:**
```markdown
# Hotfix: Fix crash on login

Quick fix for production issue.
```

**Code scanning finds:**
- SQL injection in login query (Critical severity)

**Result:**
- 1 Jira issue created in project `SEC` (default)
- No user story link (none provided)
- Labels: `github-security-alert`, `missing-user-story`, `severity-critical`, `repo-myapp`, `code-scanning`

---

### Scenario 3: Multiple User Stories

**Commit messages:**
```
commit 1: feat: add login endpoint [AUTH-100]
commit 2: feat: add registration endpoint [AUTH-101]
commit 3: refactor: update database schema [AUTH-102]
```

**PR description:**
```markdown
# Authentication Module

Implements complete authentication flow.
```

**Code scanning finds:**
- Weak password hashing (High severity)

**Result:**
- 1 Jira issue created
- Linked to `AUTH-100` (first found in commits)
- Labels: `github-security-alert`, `severity-high`, `repo-myapp`, `code-scanning`

---

## 📊 Expected Jira Issue Output

### Example Issue Created

```
Project: AUTH
Issue Type: Task
Summary: [Security Alert] SQL Injection in user_controller.js

Description:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Security Alert Details
----------------------
Severity: high
Rule: js/sql-injection
Affected File: src/controllers/user_controller.js
Lines: 45-47

Description
-----------
Unsanitized user input flows into a SQL query, which may allow
an attacker to execute arbitrary SQL commands.

Links
-----
GitHub Security Alert: https://github.com/owner/repo/security/code-scanning/123
Pull Request: https://github.com/owner/repo/pull/456

Repository Information
----------------------
Repository: owner/repo
Commit SHA: abc123def456
PR Number: #456

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Priority: High
Labels: 
  - github-security-alert
  - severity-high
  - repo-repo
  - code-scanning

Linked Issues:
  - Relates to AUTH-567 (User Story)
```

---

## 🔍 Testing Checklist

Before deploying to production, test the following scenarios:

- [ ] PR with user story in description
- [ ] PR with user story in commit message
- [ ] PR without user story (fallback)
- [ ] PR with multiple security alerts
- [ ] PR with no security alerts
- [ ] Invalid Jira key in PR description
- [ ] User story that doesn't exist in Jira
- [ ] Different severity levels (critical, high, medium, low)
- [ ] Authentication failure handling
- [ ] Network error handling

---

## 🐛 Debug Configuration

To enable detailed logging:

1. **In GitHub Actions:**
   - Go to Settings → Secrets and variables → Actions → Variables
   - Add variable: `ACTIONS_STEP_DEBUG` = `true`
   - Re-run the workflow

2. **For local testing:**
   ```bash
   export DEBUG=*
   node create-jira-issues.js --dry-run
   ```

---

## 📞 Troubleshooting Examples

### Problem: "Missing required environment variables"

**Error message:**
```
Missing required environment variables: JIRA_API_TOKEN, JIRA_DEFAULT_PROJECT
```

**Solution:**
1. Verify secrets are set in GitHub repository settings
2. Check secret names match exactly (case-sensitive)
3. Ensure secrets are available to the workflow

---

### Problem: "Jira issue not found"

**Error message:**
```
Jira issue not found: PROJ-999
```

**Solution:**
1. Verify the Jira issue key is correct
2. Ensure the issue exists in your Jira instance
3. Check that your Jira user has permission to view the issue

---

### Problem: "Authentication failed"

**Error message:**
```
Error creating Jira issue: 401 Unauthorized
```

**Solution:**
1. Verify API token is correct
2. Check email address matches Jira account
3. Regenerate API token if needed
4. Ensure Jira account is active

---

## 🎓 Best Practices

### PR Description Best Practices

✅ **DO:**
- Include user story at the top of the description
- Use consistent format: `User Story: PROJ-123`
- Provide clear description of changes
- Link related issues

❌ **DON'T:**
- Bury user story in long text
- Use inconsistent formats
- Forget to include user story
- Reference non-existent Jira issues

### Commit Message Best Practices

✅ **DO:**
- Follow conventional commits format
- Include user story in footer
- Write clear, descriptive messages
- Reference Jira issue consistently

❌ **DON'T:**
- Use vague commit messages
- Mix multiple formats
- Skip user story reference
- Use lowercase Jira keys

### Security Best Practices

✅ **DO:**
- Review all security alerts promptly
- Link alerts to relevant user stories
- Assign clear ownership
- Track remediation progress

❌ **DON'T:**
- Ignore security alerts
- Create orphaned issues without context
- Skip fallback labeling
- Disable the integration

---

## 📈 Metrics and Monitoring

### Key Metrics to Track

1. **Alert Creation Rate**
   - Number of security alerts per PR
   - Trend over time

2. **User Story Linkage Rate**
   - Percentage with user stories vs. fallback
   - Improvement over time

3. **Resolution Time**
   - Time from alert creation to resolution
   - By severity level

4. **False Positive Rate**
   - Alerts closed as false positives
   - By rule type

### Example Jira JQL Queries

```jql
// All security alerts from GitHub
labels = "github-security-alert"

// Alerts without user stories
labels = "missing-user-story" AND labels = "github-security-alert"

// High severity alerts
labels = "severity-high" AND labels = "github-security-alert"

// Alerts by repository
labels = "repo-myapp" AND labels = "github-security-alert"

// Unresolved critical alerts
labels = "severity-critical" AND labels = "github-security-alert" AND status != Done
```

---

## 🔗 Additional Resources

- [GitHub Code Scanning Documentation](https://docs.github.com/en/code-security/code-scanning)
- [Jira REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Creating Jira API Tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)

---

**Need help?** Check the main [README](../README.md) for detailed documentation.
