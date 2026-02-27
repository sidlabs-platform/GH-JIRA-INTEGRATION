import {
  sanitizeString,
  sanitizeUrl,
  sanitizeNumber,
  sanitizeSeverity,
  sanitizeLabel,
  escapeJql,
  isValidJiraKey,
  meetsSeverityThreshold,
} from '../../src/utils/sanitization';

describe('sanitizeString', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
  });

  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('removes control characters', () => {
    expect(sanitizeString('ab\x00cd\x07ef')).toBe('abcdef');
  });

  it('truncates to max length', () => {
    expect(sanitizeString('abcdefgh', 5)).toBe('abcde');
  });

  it('converts numbers to strings', () => {
    expect(sanitizeString(42)).toBe('42');
  });
});

describe('sanitizeUrl', () => {
  it('returns valid https URL', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('returns valid http URL', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects non-http protocols', () => {
    expect(sanitizeUrl('ftp://example.com')).toBe('');
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('returns fallback for invalid URLs', () => {
    expect(sanitizeUrl('not-a-url', 'fallback')).toBe('fallback');
  });

  it('returns fallback for empty', () => {
    expect(sanitizeUrl('', 'fb')).toBe('fb');
    expect(sanitizeUrl(null)).toBe('');
  });
});

describe('sanitizeNumber', () => {
  it('returns valid non-negative integers', () => {
    expect(sanitizeNumber(42)).toBe(42);
    expect(sanitizeNumber(0)).toBe(0);
  });

  it('returns fallback for invalid numbers', () => {
    expect(sanitizeNumber('abc')).toBeNull();
    expect(sanitizeNumber(-1)).toBeNull();
    expect(sanitizeNumber(1.5)).toBeNull();
    expect(sanitizeNumber(null, 99)).toBe(99);
  });
});

describe('sanitizeSeverity', () => {
  it('accepts known severities', () => {
    expect(sanitizeSeverity('critical')).toBe('critical');
    expect(sanitizeSeverity('HIGH')).toBe('high');
    expect(sanitizeSeverity('Medium')).toBe('medium');
  });

  it('returns fallback for unknown', () => {
    expect(sanitizeSeverity('extreme')).toBe('medium');
    expect(sanitizeSeverity('', 'low')).toBe('low');
  });
});

describe('sanitizeLabel', () => {
  it('replaces invalid characters with hyphens', () => {
    expect(sanitizeLabel('hello world!')).toBe('hello-world-');
  });

  it('allows valid characters', () => {
    expect(sanitizeLabel('repo-name_v1.0')).toBe('repo-name_v1.0');
  });

  it('returns empty for null/empty', () => {
    expect(sanitizeLabel(null)).toBe('');
    expect(sanitizeLabel('')).toBe('');
  });
});

describe('escapeJql', () => {
  it('escapes backslashes and double quotes', () => {
    expect(escapeJql('test\\value')).toBe('test\\\\value');
    expect(escapeJql('test"value')).toBe('test\\"value');
  });

  it('returns empty for empty input', () => {
    expect(escapeJql('')).toBe('');
  });
});

describe('isValidJiraKey', () => {
  it('accepts valid Jira keys', () => {
    expect(isValidJiraKey('PROJ-123')).toBe(true);
    expect(isValidJiraKey('AB-1')).toBe(true);
    expect(isValidJiraKey('TEST123-456')).toBe(true);
  });

  it('rejects invalid keys', () => {
    expect(isValidJiraKey('proj-123')).toBe(false);
    expect(isValidJiraKey('P-')).toBe(false);
    expect(isValidJiraKey('123-456')).toBe(false);
    expect(isValidJiraKey('')).toBe(false);
  });
});

describe('meetsSeverityThreshold', () => {
  it('high meets low threshold', () => {
    expect(meetsSeverityThreshold('high', 'low')).toBe(true);
  });

  it('low does not meet high threshold', () => {
    expect(meetsSeverityThreshold('low', 'high')).toBe(false);
  });

  it('same severity meets threshold', () => {
    expect(meetsSeverityThreshold('medium', 'medium')).toBe(true);
  });

  it('critical meets any threshold', () => {
    expect(meetsSeverityThreshold('critical', 'critical')).toBe(true);
    expect(meetsSeverityThreshold('critical', 'low')).toBe(true);
  });
});
