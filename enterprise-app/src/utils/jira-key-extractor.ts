/**
 * Jira key extraction from PR descriptions and commit messages.
 * Ported from the original create-jira-issues.js.
 */

const JIRA_KEY_PATTERNS: RegExp[] = [
  // Direct Jira key (e.g., PROJ-123, SUB-PROJ-123)
  /\b([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\b/g,
  // Explicit markers: "User Story: PROJ-123", "JIRA: PROJ-123", etc.
  /(?:User Story|JIRA|Story|Issue):\s*([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)/gi,
  // Bracketed format: [PROJ-123]
  /\[([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)\]/g,
];

const FALSE_POSITIVE_PATTERN = /^(HTTP|ERROR|ISO|UTF|TCP|UDP|SSL|TLS|API|SDK|CLI|URL|URI)-\d+$/;

/** Extract unique Jira issue keys from text. */
export function extractJiraKeys(text: string): string[] {
  if (!text) return [];

  const keys = new Set<string>();

  for (const pattern of JIRA_KEY_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const key = match[1];
      if (
        key &&
        /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/.test(key) &&
        !FALSE_POSITIVE_PATTERN.test(key)
      ) {
        keys.add(key);
      }
    }
  }

  return Array.from(keys);
}

export interface CommitInfo {
  sha: string;
  message: string;
}

/**
 * Find user story from PR description and commit messages.
 * Precedence: PR description > Commit messages (most recent first).
 */
export function findUserStory(
  prDescription: string,
  commits: CommitInfo[],
): string | null {
  // 1. Check PR description first (highest precedence)
  const prKeys = extractJiraKeys(prDescription);
  if (prKeys.length > 0) {
    return prKeys[0];
  }

  // 2. Check commit messages (most recent first)
  if (commits && commits.length > 0) {
    for (const commit of commits) {
      const commitKeys = extractJiraKeys(commit.message);
      if (commitKeys.length > 0) {
        return commitKeys[0];
      }
    }
  }

  return null;
}

/** Extract project key from a Jira issue key. */
export function extractProjectKey(issueKey: string, fallback: string): string {
  const match = issueKey.match(/^([A-Z][A-Z0-9-]+?)-\d+$/);
  return match ? match[1] : fallback;
}
