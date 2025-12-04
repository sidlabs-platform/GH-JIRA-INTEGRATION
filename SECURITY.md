# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please send an email to the maintainers. All security vulnerabilities will be promptly addressed.

**Please do not report security vulnerabilities through public GitHub issues.**

### What to Include

When reporting a vulnerability, please include:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. Potential impact
4. Suggested fix (if any)

## Security Best Practices

### For Contributors

1. **Never commit secrets**: Do not commit API keys, tokens, passwords, or other sensitive data
2. **Use environment variables**: Store sensitive configuration in environment variables
3. **Review dependencies**: Regularly update and audit dependencies for vulnerabilities
4. **Follow least privilege**: Request only necessary permissions for GitHub and JIRA APIs
5. **Sanitize inputs**: Always validate and sanitize user inputs
6. **Use HTTPS**: All API calls should use secure HTTPS connections

### For Users

1. **Protect credentials**: Store JIRA and GitHub credentials securely
2. **Use tokens with minimal scope**: Create API tokens with only the permissions needed
3. **Rotate credentials regularly**: Update API keys and tokens periodically
4. **Monitor access logs**: Review access logs for suspicious activity
5. **Keep dependencies updated**: Regularly update the application and its dependencies

## Security Features

- `.gitignore` configured to prevent committing sensitive files
- Dependabot configured for automated dependency updates
- CodeQL analysis for vulnerability scanning
- Secret scanning enabled (repository setting)

## Known Security Considerations

### API Token Management
- GitHub Personal Access Tokens should be stored securely and never committed to version control
- JIRA API tokens should use OAuth 2.0 or API tokens with minimal required scopes
- Tokens should be rotated regularly

### Data Privacy
- Issue data synchronized between GitHub and JIRA may contain sensitive information
- Ensure proper access controls are configured on both platforms
- Consider data residency requirements for your organization

### Network Security
- All communications with GitHub and JIRA APIs use HTTPS/TLS
- Validate SSL/TLS certificates
- Consider using webhook signatures to verify webhook authenticity

## Compliance

This integration handles data from both GitHub and JIRA platforms. Ensure compliance with:
- Your organization's security policies
- GDPR (if handling EU user data)
- SOC 2 requirements (if applicable)
- Industry-specific regulations

## Updates and Patches

Security updates will be released as soon as possible after a vulnerability is confirmed. We recommend:
- Enabling GitHub's Dependabot alerts
- Subscribing to repository releases
- Monitoring security advisories
