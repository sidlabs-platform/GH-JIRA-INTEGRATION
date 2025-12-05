# Quick Start Guide

Get the GitHub Advanced Security to Jira integration running in under 10 minutes.

---

## ⚡ Prerequisites

Before you begin, ensure you have:

- [ ] GitHub repository with Advanced Security enabled
- [ ] Jira Cloud instance
- [ ] Admin access to GitHub repository
- [ ] Jira project and permissions to create issues
- [ ] 10 minutes of time

---

## 🚀 Step 1: Copy Files (2 minutes)

Copy these files to your repository:

```bash
git clone https://github.com/siddjoshi/GH-JIRA-INTEGRATION.git
cd your-repository

# Copy the integration files
cp -r GH-JIRA-INTEGRATION/.github .
cp -r GH-JIRA-INTEGRATION/scripts .
```

**Files copied:**
- `.github/workflows/security-to-jira.yml` - GitHub Actions workflow
- `scripts/create-jira-issues.js` - Integration script
- `scripts/package.json` - Node.js dependencies
- `scripts/package-lock.json` - Locked dependencies

---

## 🔑 Step 2: Create Jira API Token (3 minutes)

1. **Go to Jira API tokens page:**
   - Visit: https://id.atlassian.com/manage-profile/security/api-tokens
   - Click "Create API token"

2. **Create token:**
   - Label: `GitHub Security Integration`
   - Click "Create"
   - **Copy the token immediately** (you won't see it again!)

3. **Note your details:**
   - Jira Base URL: `https://YOUR-DOMAIN.atlassian.net`
   - Your Email: The email you use for Jira
   - API Token: The token you just copied

---

## 🔐 Step 3: Configure GitHub Secrets (3 minutes)

1. **Go to your GitHub repository:**
   - Click **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**

2. **Add these 4 secrets:**

   | Name | Value | Example |
   |------|-------|---------|
   | `JIRA_BASE_URL` | Your Jira URL | `https://mycompany.atlassian.net` |
   | `JIRA_USER_EMAIL` | Your email | `devops@company.com` |
   | `JIRA_API_TOKEN` | Token from Step 2 | `ATATT3xFfGF0...` |
   | `JIRA_DEFAULT_PROJECT` | Project key | `SEC` |

3. **Click "Add secret" for each one**

---

## ✅ Step 4: Test the Integration (2 minutes)

### Option A: Create a Test PR

1. **Create a branch with a security issue:**
   ```bash
   git checkout -b test-security-integration
   
   # Create a file with a simple SQL injection vulnerability
   cat > test-vuln.js << 'EOF'
   const db = require('db');
   
   function getUser(userId) {
     // SQL Injection vulnerability (intentional for testing)
     return db.query('SELECT * FROM users WHERE id = ' + userId);
   }
   EOF
   
   git add test-vuln.js
   git commit -m "test: add test file for security scanning

   User Story: TEST-123"
   git push origin test-security-integration
   ```

2. **Create a Pull Request:**
   - Go to your repository on GitHub
   - Click "Compare & pull request"
   - Title: `Test Security Integration`
   - Description:
     ```markdown
     Testing the GitHub Security to Jira integration.
     
     User Story: TEST-123
     ```
   - Click "Create pull request"

3. **Wait for Code Scanning:**
   - Code scanning will run automatically
   - Check the "Security" tab for alerts
   - The workflow will trigger after alerts are created

### Option B: Manual Workflow Test

If you have existing security alerts:

1. Go to **Actions** tab in your repository
2. Select **GitHub Security to Jira Integration** workflow
3. Click **Run workflow**
4. Select a branch and click **Run workflow**

---

## 🎯 Step 5: Verify Success

### Check GitHub Actions

1. **Go to Actions tab:**
   - Click on the running workflow
   - Watch the logs in real-time

2. **Look for success messages:**
   ```
   ✓ Created issue for alert: js/sql-injection
   Successfully created 1 of 1 Jira issues
   ```

### Check Jira

1. **Go to your Jira project:**
   - Navigate to `https://YOUR-DOMAIN.atlassian.net/browse/SEC`
   - Or search for issues with label: `github-security-alert`

2. **Verify the issue:**
   - Should have title like: `[Security Alert] SQL Injection in test-vuln.js`
   - Should have labels: `github-security-alert`, `severity-high`, etc.
   - Should have links to GitHub alert and PR

---

## 📝 Step 6: Use in Real PRs

Now that it's working, use it in your regular workflow:

### PR Description Format

```markdown
# Feature: Add User Authentication

## Description
Implements JWT-based authentication for the API.

## User Story
AUTH-456

## Changes
- Added JWT middleware
- Created authentication endpoints
- Updated user model
```

### Commit Message Format

```
feat: add JWT authentication

Implements user authentication using JWT tokens.

User Story: AUTH-456
```

---

## 🎓 What Happens Next?

When you create a PR:

1. **Developer creates PR** with user story reference
2. **Code Scanning runs** automatically
3. **Security alerts detected** (if any)
4. **Workflow triggers** automatically
5. **Jira issues created** and linked to user story
6. **Team is notified** via Jira

---

## 🔧 Customization (Optional)

### Change Issue Type

Default is `Task`. To change:

1. Go to **Settings** → **Secrets and variables** → **Actions** → **Variables**
2. Add variable:
   - Name: `JIRA_DEFAULT_ISSUE_TYPE`
   - Value: `Bug` (or `Sub-task`, etc.)

### Change Labels

1. Add variables:
   - `JIRA_FALLBACK_LABEL`: Default is `missing-user-story`
   - `JIRA_SECURITY_LABEL`: Default is `github-security-alert`

---

## ❓ Troubleshooting

### Issue: Workflow doesn't run

**Check:**
- Is Code Scanning enabled? (Settings → Security → Code scanning)
- Is the workflow file in `.github/workflows/`?
- Are there any syntax errors in the YAML?

### Issue: Authentication failed

**Check:**
- Is the API token correct?
- Does the email match your Jira account?
- Has the token been revoked?

**Solution:**
```bash
# Generate a new token and update the secret
# See Step 2 above
```

### Issue: No issues created

**Check:**
- Are there security alerts for the PR?
- Check workflow logs for errors
- Verify project key exists in Jira

**Debug:**
```bash
# Enable debug logging
# Settings → Secrets and variables → Variables
# Add: ACTIONS_STEP_DEBUG = true
```

---

## 📚 Next Steps

Now that the integration is working:

1. **Read the full documentation:**
   - [README.md](../README.md) - Complete guide
   - [EXAMPLES.md](./EXAMPLES.md) - More examples
   - [SECURITY.md](./SECURITY.md) - Security best practices

2. **Configure your team:**
   - Train developers on user story format
   - Set up Jira project for security issues
   - Establish review process for security alerts

3. **Monitor and improve:**
   - Review created issues regularly
   - Adjust labels and issue types as needed
   - Provide feedback to your team

---

## ✅ Quick Start Checklist

- [ ] Files copied to repository
- [ ] Jira API token created
- [ ] GitHub secrets configured
- [ ] Test PR created
- [ ] Workflow ran successfully
- [ ] Jira issue verified
- [ ] Team trained on usage
- [ ] Documentation reviewed

---

## 🆘 Need Help?

- **Check the logs:** GitHub Actions logs show detailed information
- **Review examples:** [EXAMPLES.md](./EXAMPLES.md) has many scenarios
- **Security questions:** See [SECURITY.md](./SECURITY.md)
- **API details:** Check [API.md](./API.md)

---

## 🎉 You're Done!

Congratulations! Your GitHub Advanced Security to Jira integration is now active.

Every PR will now automatically create Jira issues for security alerts, keeping your team informed and your codebase secure.

---

**Estimated Setup Time:** 10 minutes  
**Difficulty:** Easy  
**Maintenance:** Minimal (rotate API tokens quarterly)

**Enjoy your automated security workflow! 🚀**
