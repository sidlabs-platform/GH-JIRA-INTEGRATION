import {
  extractJiraKeys,
  findUserStory,
  extractProjectKey,
} from '../../src/utils/jira-key-extractor';

describe('extractJiraKeys', () => {
  it('extracts simple Jira keys', () => {
    expect(extractJiraKeys('Fix for PROJ-123')).toEqual(['PROJ-123']);
  });

  it('extracts multiple keys', () => {
    const keys = extractJiraKeys('PROJ-123 and PROJ-456 are related');
    expect(keys).toContain('PROJ-123');
    expect(keys).toContain('PROJ-456');
  });

  it('extracts from User Story marker', () => {
    expect(extractJiraKeys('User Story: FEAT-42')).toContain('FEAT-42');
  });

  it('extracts from JIRA marker', () => {
    expect(extractJiraKeys('JIRA: SEC-100')).toContain('SEC-100');
  });

  it('extracts from Story marker', () => {
    expect(extractJiraKeys('Story: DEV-7')).toContain('DEV-7');
  });

  it('extracts bracketed keys', () => {
    expect(extractJiraKeys('Related to [PROJ-789]')).toContain('PROJ-789');
  });

  it('excludes false positives', () => {
    expect(extractJiraKeys('Uses HTTP-200 and UTF-8')).toEqual([]);
    expect(extractJiraKeys('API-500 response')).toEqual([]);
  });

  it('handles multi-hyphen keys', () => {
    expect(extractJiraKeys('SUB-PROJ-123')).toContain('SUB-PROJ-123');
  });

  it('returns empty for no matches', () => {
    expect(extractJiraKeys('No keys here')).toEqual([]);
    expect(extractJiraKeys('')).toEqual([]);
  });

  it('returns unique keys', () => {
    const keys = extractJiraKeys('PROJ-123 and PROJ-123 again');
    expect(keys).toEqual(['PROJ-123']);
  });
});

describe('findUserStory', () => {
  it('prioritizes PR description over commits', () => {
    const result = findUserStory('User Story: PR-100', [
      { sha: 'abc', message: 'fix: COMMIT-200 stuff' },
    ]);
    expect(result).toBe('PR-100');
  });

  it('falls back to commit messages', () => {
    const result = findUserStory('No keys here', [
      { sha: 'abc', message: 'fix: COMMIT-200 stuff' },
    ]);
    expect(result).toBe('COMMIT-200');
  });

  it('returns null when no keys found', () => {
    const result = findUserStory('No keys', [
      { sha: 'abc', message: 'plain commit' },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(findUserStory('', [])).toBeNull();
  });
});

describe('extractProjectKey', () => {
  it('extracts simple project key', () => {
    expect(extractProjectKey('PROJ-123', 'DEFAULT')).toBe('PROJ');
  });

  it('extracts multi-part project key', () => {
    expect(extractProjectKey('SUB-PROJ-123', 'DEFAULT')).toBe('SUB-PROJ');
  });

  it('returns fallback for invalid key', () => {
    expect(extractProjectKey('invalid', 'DEFAULT')).toBe('DEFAULT');
  });
});
