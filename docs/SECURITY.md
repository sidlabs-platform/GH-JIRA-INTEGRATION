# Security Considerations

This document outlines security best practices and considerations for the GitHub Advanced Security to Jira integration.

---

## 🔒 Secrets Management

### GitHub Secrets

All sensitive credentials are stored in GitHub Secrets, which:
- Are encrypted at rest
- Are only accessible to authorized workflows
- Are not exposed in logs
- Cannot be retrieved once set

### Required Secrets

| Secret | Purpose | Security Notes |
|--------|---------|----------------|
| `JIRA_API_TOKEN` | Jira authentication | Rotate every 90 days |
| `JIRA_USER_EMAIL` | Jira user account | Use dedicated service account |
| `JIRA_BASE_URL` | Jira instance URL | Can be a variable instead |
| `JIRA_DEFAULT_PROJECT` | Default project key | Can be a variable instead |
| `SLACK_WEBHOOK_URL` | Slack notifications | Treat as secret; rotate if compromised |
| `TEAMS_WEBHOOK_URL` | Teams notifications | Treat as secret; rotate if compromised |

### Best Practices

✅ **DO:**
- Use dedicated service accounts for automation
- Rotate API tokens regularly (recommended: every 90 days)
- Use least-privileged Jira accounts (only issue creation permissions)
- Monitor secret usage via audit logs
- Revoke tokens immediately if compromised

❌ **DON'T:**
- Share API tokens between systems
- Use personal Jira accounts
- Store secrets in code or environment files
- Give admin permissions to service accounts
- Reuse tokens across environments

---

## 🛡️ GitHub Actions Security

### Workflow Permissions

The workflow uses **least-privilege permissions** with targeted write access:

```yaml
permissions:
  pull-requests: write     # Write PR comments (summary notifications)
  contents: read           # Read repository contents only
  security-events: read    # Read security alerts only
  issues: write            # Write issue comments
```

**Why this matters:**
- Write permissions are limited to PR/issue comments only
- No code modification permissions
- No token elevation means attackers can't escalate privileges
- Minimal surface area reduces attack vectors

### Third-Party Actions

The workflow uses only trusted, verified actions:
- `actions/checkout@v4` - GitHub official action
- `actions/setup-node@v4` - GitHub official action

**Version pinning:**
- Actions are pinned to major versions (`@v4`)
- Consider pinning to specific SHAs for production

### Code Execution

The workflow executes:
1. `npm ci` - Installs exact versions from `package-lock.json`
2. `node create-jira-issues.js` - Our controlled script

**Security measures:**
- No dynamic script downloads
- No arbitrary code execution
- No shell injection risks
- All code is version-controlled

---

## 🔐 Jira API Security

### Authentication

Uses **Basic Authentication over HTTPS**:
- Email + API token (not password)
- Base64 encoded header
- TLS 1.2+ encryption enforced

### API Token Security

Jira API tokens:
- Are user-specific (not shared)
- Can be revoked individually
- Have audit trail in Jira
- Don't expire automatically (manual rotation needed)

### Network Security

All Jira API calls:
- Use HTTPS only (enforced by axios)
- Validate SSL certificates (default behavior)
- Have 30-second timeout (prevents hanging)
- Implement retry logic with exponential backoff

### Rate Limiting

The integration handles rate limits via:
- Automatic retry with exponential backoff
- Maximum 3 retry attempts
- Graceful degradation on persistent failures

---

## 📊 Data Security

### Data in Transit

- **GitHub → Workflow:** Encrypted via GitHub infrastructure
- **Workflow → Jira:** Encrypted via HTTPS/TLS 1.2+
- **No unencrypted data transmission**

### Data at Rest

- **GitHub Secrets:** Encrypted by GitHub
- **Jira Issues:** Encrypted by Jira Cloud
- **Workflow Logs:** May contain issue summaries (no secrets)

### Sensitive Data Handling

The integration transmits:
- ✅ Security alert metadata (severity, rule, file paths)
- ✅ PR information (number, URL, description)
- ✅ Repository information (name, commit SHA)
- ✅ Dedup hashes (SHA-256 of alert metadata, no raw content)
- ❌ **NO source code content**
- ❌ **NO actual secrets found by scanning**

### Notification Security

Slack and Teams webhook URLs:
- Must be stored as **GitHub Secrets** (never variables)
- Are only used for outbound HTTPS POST requests
- Do not receive or process inbound data
- Should be rotated if compromised
- Monitor for unauthorized message patterns

PR comments:
- Only contain alert summaries (severity, rule name, Jira key)
- Do not include vulnerability details or code snippets
- Visible to anyone with PR read access

---

## 🚨 Vulnerability Handling

### Security Alert Information

The integration creates Jira issues containing:
- Alert severity and rule ID
- Affected file path and line numbers
- Link to GitHub security alert
- **NO sensitive code snippets or actual vulnerabilities**

### Access Control

Security information is protected via:
- GitHub Advanced Security permissions (who can see alerts)
- Jira project permissions (who can see created issues)
- Issue linking permissions (who can access user stories)

### Principle of Least Exposure

- Only essential alert metadata is transmitted
- Detailed vulnerability information stays in GitHub
- Users must have appropriate permissions to view full details

---

## 🔍 Audit and Monitoring

### Audit Trails

The integration provides audit trails via:
- **GitHub Actions logs:** All workflow executions
- **Jira issue history:** All created issues
- **Jira API audit logs:** All API calls
- **GitHub audit logs:** Secret access patterns

### Monitoring Recommendations

Monitor for:
- ✅ Failed authentication attempts
- ✅ Unusual issue creation patterns
- ✅ API rate limit hits
- ✅ Workflow failures
- ✅ Secret access patterns

### Alerting

Set up alerts for:
- Multiple authentication failures
- Unexpected workflow modifications
- Secret access outside normal hours
- Unusual number of created issues

---

## 🔒 Compliance Considerations

### GDPR

- No personal data is processed beyond Jira user email
- User email is for authentication only
- All data processing is legitimate business interest

### SOC 2

- Audit trails are maintained
- Access is controlled and logged
- Secrets are encrypted at rest and in transit
- Principle of least privilege is enforced

### ISO 27001

- Security controls are documented
- Access is role-based
- Encryption is enforced
- Monitoring is implemented

---

## 🛠️ Security Testing

### Recommended Tests

1. **Authentication Tests**
   ```bash
   # Test with invalid credentials
   # Test with expired token
   # Test with revoked token
   ```

2. **Authorization Tests**
   ```bash
   # Test with minimal Jira permissions
   # Test with restricted GitHub permissions
   # Test with invalid project access
   ```

3. **Input Validation Tests**
   ```bash
   # Test with malicious PR descriptions
   # Test with injection attempts
   # Test with oversized inputs
   ```

4. **Network Security Tests**
   ```bash
   # Verify TLS version enforcement
   # Verify certificate validation
   # Test timeout handling
   ```

---

## 🚀 Secure Deployment Checklist

Before deploying to production:

- [ ] All secrets are properly configured in GitHub
- [ ] Service account has minimal required Jira permissions
- [ ] API token rotation policy is in place
- [ ] Workflow permissions are least-privileged
- [ ] Audit logging is enabled in both GitHub and Jira
- [ ] Monitoring and alerting are configured
- [ ] Team is trained on security best practices
- [ ] Incident response plan includes this integration
- [ ] Regular security reviews are scheduled
- [ ] Backup communication channel exists for failures

---

## 🔄 Token Rotation Procedure

### Rotating Jira API Token

1. **Generate new token:**
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Click "Create API token"
   - Copy the new token

2. **Update GitHub Secret:**
   - Go to repository Settings → Secrets
   - Update `JIRA_API_TOKEN` with new value

3. **Verify functionality:**
   - Trigger a test workflow run
   - Verify Jira issue creation works

4. **Revoke old token:**
   - Return to Jira API tokens page
   - Revoke the old token

### Recommended Rotation Schedule

- **Normal operations:** Every 90 days
- **After team member departure:** Immediately
- **After suspected compromise:** Immediately
- **After security incident:** Immediately

---

## 🚨 Incident Response

### If API Token is Compromised

1. **Immediate actions:**
   - Revoke the compromised token in Jira
   - Generate new token
   - Update GitHub secret
   - Review recent Jira API access logs

2. **Investigation:**
   - Review GitHub Actions logs for unusual activity
   - Check Jira for unauthorized issue modifications
   - Identify scope of compromise

3. **Remediation:**
   - Rotate all related credentials
   - Review and update access policies
   - Document lessons learned
   - Update incident response procedures

### If Workflow is Modified Maliciously

1. **Immediate actions:**
   - Disable the workflow
   - Review git history for unauthorized changes
   - Revert to last known good version

2. **Investigation:**
   - Identify who made the changes
   - Review other repository changes
   - Check for data exfiltration

3. **Remediation:**
   - Restore legitimate workflow
   - Review branch protection rules
   - Update access controls
   - Implement additional code review requirements

---

## 📋 Security Review Checklist

### Monthly Review

- [ ] Review workflow run logs for anomalies
- [ ] Check Jira issue creation patterns
- [ ] Verify no unauthorized workflow modifications
- [ ] Review secret access patterns
- [ ] Check for failed authentication attempts

### Quarterly Review

- [ ] Rotate API tokens
- [ ] Review and update permissions
- [ ] Audit service account access
- [ ] Review and update documentation
- [ ] Test incident response procedures

### Annual Review

- [ ] Comprehensive security audit
- [ ] Penetration testing consideration
- [ ] Review compliance requirements
- [ ] Update security policies
- [ ] Team security training

---

## 🔗 Security Resources

- [GitHub Actions Security Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Jira Cloud Security](https://www.atlassian.com/trust/security)
- [Jira API Token Best Practices](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

---

**Remember:** Security is an ongoing process, not a one-time setup. Regular reviews and updates are essential.
