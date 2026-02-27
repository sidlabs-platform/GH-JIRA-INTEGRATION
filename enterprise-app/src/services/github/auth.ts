import { createAppAuth } from '@octokit/auth-app';
import { createLogger } from '../../utils/logger';

const logger = createLogger('github-auth');

/** Cache of installation access tokens keyed by installationId. */
const tokenCache = new Map<number, { token: string; expiresAt: number }>();

// Buffer: refresh 5 minutes before expiry
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Generate an installation access token for a specific GitHub App installation.
 * Tokens are cached and reused until near-expiry.
 */
export async function getInstallationToken(
  appId: string,
  privateKey: string,
  installationId: number,
): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
    return cached.token;
  }

  logger.info(`Generating installation token for installation ${installationId}`);

  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });

  const { token, expiresAt } = await auth({ type: 'installation' });

  tokenCache.set(installationId, {
    token,
    expiresAt: new Date(expiresAt).getTime(),
  });

  return token;
}

/** Clear the token cache (useful for testing). */
export function clearTokenCache(): void {
  tokenCache.clear();
}
