import axios from 'axios';
import { createLogger } from '../../utils/logger';

const logger = createLogger('slack-notification');

export interface SlackPayload {
  title: string;
  message: string;
  severity: string;
  url?: string;
}

/** Send a Slack notification via incoming webhook. */
export async function sendSlackNotification(
  webhookUrl: string,
  payload: SlackPayload,
): Promise<void> {
  try {
    await axios.post(
      webhookUrl,
      {
        text: payload.title,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: payload.title },
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: payload.message },
          },
          ...(payload.url
            ? [
                {
                  type: 'section',
                  text: { type: 'mrkdwn', text: `<${payload.url}|View in Jira>` },
                },
              ]
            : []),
        ],
      },
      { timeout: 10000 },
    );
    logger.info('Sent Slack notification');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to send Slack notification: ${msg}`);
  }
}
