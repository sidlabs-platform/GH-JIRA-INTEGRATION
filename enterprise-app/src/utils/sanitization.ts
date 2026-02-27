/**
 * Input sanitization utilities.
 * Ported from the original create-jira-issues.js with TypeScript types.
 */

export const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  note: 0,
  warning: 0,
};

const MAX_STRING_LENGTH = 1000;
export const MAX_SUMMARY_LENGTH = 255;
export const MAX_LABEL_LENGTH = 255;
const VALID_SEVERITIES = new Set(Object.keys(SEVERITY_ORDER));

/** Remove control characters, trim and truncate. */
export function sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string {
  if (value == null) return '';
  const str = String(value);
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLength);
}

/** Validate and sanitize a URL (http/https only). */
export function sanitizeUrl(value: unknown, fallback = ''): string {
  if (!value) return fallback;
  const str = sanitizeString(value, 2048);
  try {
    const parsed = new URL(str);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href;
    }
  } catch {
    // invalid URL
  }
  return fallback;
}

/** Validate and sanitize a non-negative integer. */
export function sanitizeNumber(value: unknown, fallback: number | null = null): number | null {
  if (value == null) return fallback;
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0 && Number.isSafeInteger(num)) return num;
  return fallback;
}

/** Validate severity against the known set. */
export function sanitizeSeverity(value: unknown, fallback = 'medium'): string {
  if (!value) return fallback;
  const lower = String(value).toLowerCase().trim();
  return VALID_SEVERITIES.has(lower) ? lower : fallback;
}

/** Sanitize a Jira label (no spaces, safe chars only). */
export function sanitizeLabel(value: unknown): string {
  if (!value) return '';
  return String(value)
    .replace(/[^a-zA-Z0-9_.\-]/g, '-')
    .slice(0, MAX_LABEL_LENGTH);
}

/** Escape a value for safe JQL inclusion. */
export function escapeJql(value: string): string {
  if (!value) return '';
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

/** Validate that a string is a valid Jira issue key. */
export function isValidJiraKey(key: string): boolean {
  return typeof key === 'string' && JIRA_KEY_PATTERN.test(key);
}

/** Check if alert severity meets the configured threshold. */
export function meetsSeverityThreshold(alertSeverity: string, threshold: string): boolean {
  const alertLevel = SEVERITY_ORDER[(alertSeverity || '').toLowerCase()] ?? 0;
  const thresholdLevel = SEVERITY_ORDER[(threshold || '').toLowerCase()] ?? 0;
  return alertLevel >= thresholdLevel;
}
