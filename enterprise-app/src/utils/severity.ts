/** Severity to Jira priority mapping. */
export const SEVERITY_PRIORITY_MAP: Record<string, string> = {
  critical: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  warning: 'Low',
  note: 'Lowest',
  error: 'High',
};

/** Map a severity string to a Jira priority name. */
export function mapSeverityToPriority(severity: string): string {
  return SEVERITY_PRIORITY_MAP[severity?.toLowerCase()] || 'Medium';
}

/** Extract the "effective" severity from an alert. */
export function getEffectiveSeverity(alert: { rule: { security_severity_level?: string; severity?: string } }): string {
  return (alert.rule.security_severity_level || alert.rule.severity || 'medium').toLowerCase();
}
