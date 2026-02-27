import { Octokit } from '@octokit/rest';
import { getInstallationToken } from './auth';

/**
 * Create an authenticated Octokit client for a specific installation.
 * Uses installation access tokens (short-lived, auto-rotated).
 */
export async function createGitHubClient(
  appId: string,
  privateKey: string,
  installationId: number,
): Promise<Octokit> {
  const token = await getInstallationToken(appId, privateKey, installationId);
  return new Octokit({ auth: token });
}
