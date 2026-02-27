/** Configuration for a single alert type. */
export interface AlertTypeConfig {
  enabled: boolean;
  severityThreshold: string;
}

/** Jira connection and defaults for an org. */
export interface OrgJiraConfig {
  credentialRef: string;
  baseUrl: string;
  defaultProject: string;
  defaultIssueType: string;
  linkType: string;
  securityLabel: string;
  fallbackLabel: string;
}

/** EPIC resolution settings. */
export interface EpicResolutionConfig {
  enabled: boolean;
  validateType: boolean;
  traverseHierarchy: boolean;
  acceptedTypes: string[];
}

/** Notification settings. */
export interface NotificationConfig {
  prComment: {
    enabled: boolean;
    onMissingEpic: boolean;
    onIssueCreated: boolean;
  };
  slack: {
    enabled: boolean;
    webhookRef: string;
  };
  teams: {
    enabled: boolean;
    webhookRef: string;
  };
}

/** Per-repo override (partial). */
export interface RepoOverride {
  alerts?: Partial<Record<string, Partial<AlertTypeConfig>>>;
  jira?: Partial<OrgJiraConfig>;
  notifications?: Partial<NotificationConfig>;
}

/** Full organization configuration stored in Cosmos DB. */
export interface OrgConfig {
  id: string;
  partitionKey: 'org-config';
  org: string;
  enabled: boolean;
  installationId: number;
  createdAt: string;
  updatedAt: string;

  jira: OrgJiraConfig;

  alerts: {
    code_scanning: AlertTypeConfig;
    secret_scanning: AlertTypeConfig;
    dependabot: AlertTypeConfig;
  };

  epicResolution: EpicResolutionConfig;
  notifications: NotificationConfig;

  repoOverrides: Record<string, RepoOverride>;
}
