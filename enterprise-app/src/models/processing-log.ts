/** Audit log entry for each processed alert. */
export interface ProcessingLogEntry {
  id: string;
  partitionKey: string; // org name
  org: string;
  repo: string;
  alertType: string;
  alertNumber: number;
  alertUrl: string;
  severity: string;
  action: 'created' | 'duplicate_skipped' | 'filtered' | 'error';
  jiraKey?: string;
  userStory?: string;
  correlationId: string;
  durationMs: number;
  error?: string;
  processedAt: string;
}
