import * as fs from 'fs';
import * as path from 'path';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;

  github: {
    appId: string;
    privateKey: string;
    webhookSecret: string;
  };

  azure: {
    cosmosEndpoint: string;
    cosmosDatabase: string;
    keyVaultUrl: string;
    serviceBusNamespace: string;
  };

  appInsightsConnectionString: string;
}

function readPrivateKey(): string {
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const keyEnv = process.env.GITHUB_APP_PRIVATE_KEY;

  if (keyEnv) {
    // Allow newline-escaped key from env var
    return keyEnv.replace(/\\n/g, '\n');
  }

  if (keyPath) {
    const resolved = path.resolve(keyPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Private key file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf8');
  }

  throw new Error(
    'GitHub App private key not configured. Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH.',
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadAppConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',

    github: {
      appId: requireEnv('GITHUB_APP_ID'),
      privateKey: readPrivateKey(),
      webhookSecret: requireEnv('GITHUB_WEBHOOK_SECRET'),
    },

    azure: {
      cosmosEndpoint: requireEnv('AZURE_COSMOS_ENDPOINT'),
      cosmosDatabase: process.env.AZURE_COSMOS_DATABASE || 'security-jira',
      keyVaultUrl: requireEnv('AZURE_KEYVAULT_URL'),
      serviceBusNamespace: requireEnv('AZURE_SERVICEBUS_NAMESPACE'),
    },

    appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '',
  };
}
