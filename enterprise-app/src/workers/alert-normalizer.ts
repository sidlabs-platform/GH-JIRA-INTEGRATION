import type { NormalizedAlert, AlertType } from '../../models/alert';
import {
  sanitizeString,
  sanitizeUrl,
  sanitizeNumber,
  sanitizeSeverity,
} from '../../utils/sanitization';
import { createLogger } from '../../utils/logger';

const logger = createLogger('alert-normalizer');

/**
 * Normalize a raw alert payload from a GitHub webhook into a consistent structure.
 */
export function normalizeAlert(
  eventName: string,
  rawAlert: Record<string, unknown>,
): NormalizedAlert | null {
  if (!rawAlert || typeof rawAlert !== 'object') {
    logger.warn('Invalid alert payload: expected an object');
    return null;
  }

  const alertNumber = sanitizeNumber(rawAlert.number as unknown);
  if (alertNumber == null) {
    logger.warn('Invalid alert payload: missing or invalid alert number');
    return null;
  }

  const alertUrl = sanitizeUrl(rawAlert.html_url as unknown);

  switch (eventName) {
    case 'code_scanning_alert': {
      const rule = rawAlert.rule as Record<string, unknown> | undefined;
      const instance = rawAlert.most_recent_instance as Record<string, unknown> | undefined;
      const location = instance?.location as Record<string, unknown> | undefined;
      return {
        _type: 'code_scanning' as AlertType,
        number: alertNumber,
        html_url: alertUrl,
        rule: {
          id: sanitizeString(rule?.id, 255) || '',
          severity: sanitizeSeverity(rule?.severity),
          security_severity_level: sanitizeSeverity(
            (rule?.security_severity_level as string) || (rule?.severity as string),
          ),
          description: sanitizeString(rule?.description) || 'Code Scanning Alert',
          full_description: sanitizeString(
            (rule?.full_description as string) || (rule?.description as string) || '',
            5000,
          ),
        },
        most_recent_instance: {
          location: {
            path: sanitizeString(location?.path, 500) || '',
            start_line: sanitizeNumber(location?.start_line),
            end_line: sanitizeNumber(location?.end_line),
          },
          commit_sha: sanitizeString(instance?.commit_sha, 40),
        },
      };
    }

    case 'secret_scanning_alert': {
      const secretType = sanitizeString(rawAlert.secret_type, 255) || 'secret';
      const displayName = sanitizeString(rawAlert.secret_type_display_name, 255);
      return {
        _type: 'secret_scanning' as AlertType,
        number: alertNumber,
        html_url: alertUrl,
        rule: {
          id: secretType,
          severity: 'critical',
          security_severity_level: 'critical',
          description: `Secret Detected: ${displayName || secretType || 'Unknown'}`,
          full_description: `A ${displayName || secretType} secret was detected in the repository.`,
        },
        most_recent_instance: {
          location: { path: 'N/A' },
        },
      };
    }

    case 'dependabot_alert': {
      const advisory = rawAlert.security_advisory as Record<string, unknown> | undefined;
      const dep = rawAlert.dependency as Record<string, unknown> | undefined;
      const pkg = dep?.package as Record<string, unknown> | undefined;
      return {
        _type: 'dependabot' as AlertType,
        number: alertNumber,
        html_url: alertUrl,
        rule: {
          id:
            sanitizeString(advisory?.cve_id, 255) ||
            sanitizeString(advisory?.ghsa_id, 255) ||
            `dependabot-${alertNumber}`,
          severity: sanitizeSeverity(advisory?.severity),
          security_severity_level: sanitizeSeverity(advisory?.severity),
          description: sanitizeString(advisory?.summary) || 'Dependabot Alert',
          full_description: sanitizeString(advisory?.description || '', 5000),
        },
        most_recent_instance: {
          location: {
            path: sanitizeString(dep?.manifest_path, 500) || 'N/A',
          },
          commit_sha: '',
        },
        _packageName: sanitizeString(pkg?.name, 255),
        _vulnerableRange: sanitizeString(rawAlert.vulnerable_version_range as string, 255),
      };
    }

    default:
      logger.warn(`Unknown event type: ${eventName}`);
      return null;
  }
}
