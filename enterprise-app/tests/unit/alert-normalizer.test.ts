import { normalizeAlert } from '../../src/workers/alert-normalizer';

describe('normalizeAlert', () => {
  describe('code_scanning_alert', () => {
    it('normalizes a valid code scanning alert', () => {
      const raw = {
        number: 42,
        html_url: 'https://github.com/org/repo/security/code-scanning/42',
        rule: {
          id: 'js/sql-injection',
          severity: 'error',
          security_severity_level: 'high',
          description: 'SQL Injection',
          full_description: 'Detailed description',
        },
        most_recent_instance: {
          location: {
            path: 'src/db.js',
            start_line: 15,
            end_line: 20,
          },
          commit_sha: 'abc123',
        },
      };

      const result = normalizeAlert('code_scanning_alert', raw);
      expect(result).not.toBeNull();
      expect(result!._type).toBe('code_scanning');
      expect(result!.number).toBe(42);
      expect(result!.rule.id).toBe('js/sql-injection');
      expect(result!.rule.security_severity_level).toBe('high');
      expect(result!.most_recent_instance.location.path).toBe('src/db.js');
    });
  });

  describe('secret_scanning_alert', () => {
    it('normalizes a valid secret scanning alert', () => {
      const raw = {
        number: 7,
        html_url: 'https://github.com/org/repo/security/secret-scanning/7',
        secret_type: 'github_personal_access_token',
        secret_type_display_name: 'GitHub PAT',
      };

      const result = normalizeAlert('secret_scanning_alert', raw);
      expect(result).not.toBeNull();
      expect(result!._type).toBe('secret_scanning');
      expect(result!.rule.severity).toBe('critical');
      expect(result!.rule.description).toContain('GitHub PAT');
    });
  });

  describe('dependabot_alert', () => {
    it('normalizes a valid dependabot alert', () => {
      const raw = {
        number: 99,
        html_url: 'https://github.com/org/repo/security/dependabot/99',
        security_advisory: {
          cve_id: 'CVE-2025-12345',
          ghsa_id: 'GHSA-xxxx',
          severity: 'critical',
          summary: 'RCE in example-lib',
          description: 'Full description here',
        },
        dependency: {
          package: { name: 'example-lib' },
          manifest_path: 'package.json',
        },
        vulnerable_version_range: '< 2.0.0',
      };

      const result = normalizeAlert('dependabot_alert', raw);
      expect(result).not.toBeNull();
      expect(result!._type).toBe('dependabot');
      expect(result!.rule.id).toBe('CVE-2025-12345');
      expect(result!._packageName).toBe('example-lib');
    });
  });

  describe('invalid input', () => {
    it('returns null for missing alert number', () => {
      expect(normalizeAlert('code_scanning_alert', { html_url: 'https://x.com' })).toBeNull();
    });

    it('returns null for unknown event type', () => {
      expect(normalizeAlert('unknown_event', { number: 1 })).toBeNull();
    });

    it('returns null for null payload', () => {
      expect(normalizeAlert('code_scanning_alert', null as any)).toBeNull();
    });
  });
});
