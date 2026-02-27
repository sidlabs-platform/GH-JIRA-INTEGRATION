import axios from 'axios';
import { createLogger } from '../../utils/logger';

const logger = createLogger('teams-notification');

export interface TeamsPayload {
  title: string;
  message: string;
  severity: string;
  url?: string;
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'FF0000';
    case 'high': return 'FFA500';
    default: return '0076D7';
  }
}

/** Send a Microsoft Teams notification via incoming webhook. */
export async function sendTeamsNotification(
  webhookUrl: string,
  payload: TeamsPayload,
): Promise<void> {
  try {
    await axios.post(
      webhookUrl,
      {
        '@type': 'MessageCard',
        summary: payload.title,
        themeColor: severityColor(payload.severity),
        title: payload.title,
        sections: [{ activityTitle: payload.message }],
        potentialAction: payload.url
          ? [
              {
                '@type': 'OpenUri',
                name: 'View in Jira',
                targets: [{ os: 'default', uri: payload.url }],
              },
            ]
          : [],
      },
      { timeout: 10000 },
    );
    logger.info('Sent Teams notification');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to send Teams notification: ${msg}`);
  }
}
