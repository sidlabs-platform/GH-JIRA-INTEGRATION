/** Normalized alert structure shared across all alert types. */
export type AlertType = 'code_scanning' | 'secret_scanning' | 'dependabot';

export interface AlertLocation {
  path: string;
  start_line?: number | null;
  end_line?: number | null;
}

export interface AlertRule {
  id: string;
  severity: string;
  security_severity_level: string;
  description: string;
  full_description: string;
}

export interface NormalizedAlert {
  _type: AlertType;
  number: number;
  html_url: string;
  rule: AlertRule;
  most_recent_instance: {
    location: AlertLocation;
    commit_sha?: string;
  };
  _packageName?: string;
  _vulnerableRange?: string;
}

/** Webhook event envelope as received from GitHub. */
export interface WebhookEvent {
  event: string;
  action: string;
  payload: {
    alert: Record<string, unknown>;
    repository: { full_name: string; name: string };
    organization: { login: string };
    installation: { id: number };
    sender?: { login: string };
  };
  receivedAt: string;
  deliveryId: string;
}

/** Queued message for Service Bus. */
export interface AlertMessage {
  event: string;
  action: string;
  payload: WebhookEvent['payload'];
  receivedAt: string;
  deliveryId: string;
  severity: string;
  org: string;
  repo: string;
}
