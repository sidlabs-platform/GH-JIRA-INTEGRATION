import type { OrgConfig } from '../models/org-config';

/** Default org configuration used when creating a new org entry. */
export function createDefaultOrgConfig(
  org: string,
  installationId: number,
): OrgConfig {
  const now = new Date().toISOString();
  return {
    id: `org-${org}`,
    partitionKey: 'org-config',
    org,
    enabled: true,
    installationId,
    createdAt: now,
    updatedAt: now,

    jira: {
      credentialRef: `jira-${org}`,
      baseUrl: '',
      defaultProject: 'SEC',
      defaultIssueType: 'Task',
      linkType: 'Relates',
      securityLabel: 'github-security-alert',
      fallbackLabel: 'missing-user-story',
    },

    alerts: {
      code_scanning: { enabled: true, severityThreshold: 'low' },
      secret_scanning: { enabled: true, severityThreshold: 'low' },
      dependabot: { enabled: true, severityThreshold: 'medium' },
    },

    epicResolution: {
      enabled: true,
      validateType: true,
      traverseHierarchy: true,
      acceptedTypes: ['Epic', 'Story'],
    },

    notifications: {
      prComment: {
        enabled: true,
        onMissingEpic: true,
        onIssueCreated: true,
      },
      slack: { enabled: false, webhookRef: '' },
      teams: { enabled: false, webhookRef: '' },
    },

    repoOverrides: {},
  };
}
