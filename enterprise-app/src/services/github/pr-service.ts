import type { Octokit } from '@octokit/rest';
import { createLogger } from '../../utils/logger';
import type { CommitInfo } from '../../utils/jira-key-extractor';

const logger = createLogger('pr-service');

/** Fetch PR details including body and head SHA. */
export async function fetchPRDetails(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{ body: string; headSha: string; htmlUrl: string } | null> {
  try {
    const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
    return {
      body: data.body || '',
      headSha: data.head.sha,
      htmlUrl: data.html_url,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not fetch PR #${prNumber}: ${msg}`, { org: owner, repo: `${owner}/${repo}` });
    return null;
  }
}

/** Fetch commits for a PR, returning simplified commit info. */
export async function fetchPRCommits(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<CommitInfo[]> {
  try {
    const { data } = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });
    return data.map((c) => ({ sha: c.sha, message: c.commit.message }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not fetch PR commits: ${msg}`, { org: owner, repo: `${owner}/${repo}` });
    return [];
  }
}

/** Find a PR associated with a commit SHA. */
export async function findPRForCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  commitSha: string,
): Promise<{ number: number; body: string; headSha: string; htmlUrl: string } | null> {
  if (!commitSha) return null;
  try {
    const { data: prs } = await octokit.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });
    if (prs.length > 0) {
      const pr = prs[0];
      return {
        number: pr.number,
        body: pr.body || '',
        headSha: pr.head.sha,
        htmlUrl: pr.html_url,
      };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Could not find PR for commit ${commitSha}: ${msg}`);
  }
  return null;
}

/** Post a comment on a PR. */
export async function postPRComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
): Promise<void> {
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    logger.info(`Posted comment on PR #${prNumber}`, { org: owner, repo: `${owner}/${repo}` });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to post PR comment: ${msg}`, { org: owner, repo: `${owner}/${repo}` });
  }
}
