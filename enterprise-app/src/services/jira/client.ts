import axios, { type AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { createLogger } from '../../utils/logger';

const logger = createLogger('jira-client');

export interface JiraCredentials {
  userEmail: string;
  apiToken: string;
}

/**
 * Create an authenticated Jira API client with retry logic.
 */
export function createJiraClient(baseUrl: string, credentials: JiraCredentials): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${credentials.userEmail}:${credentials.apiToken}`,
      ).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 30000,
  });

  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      return (
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response != null && error.response.status >= 500)
      );
    },
    onRetry: (retryCount, error) => {
      logger.warn(`Retry attempt ${retryCount} for ${error.config?.url}`);
    },
  });

  return client;
}
