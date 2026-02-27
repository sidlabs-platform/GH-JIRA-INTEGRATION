# Enterprise Security-to-Jira GitHub App

A centralized GitHub App that automatically creates Jira issues when GitHub Advanced Security detects vulnerabilities across all organizations in a GitHub Enterprise.

## Architecture

```
GitHub Enterprise (100s of orgs)
    │
    │  Webhook events: code_scanning_alert, secret_scanning_alert, dependabot_alert
    ▼
┌─────────────────────────────────────────┐
│         Hosting Service (Azure)          │
│                                         │
│  Webhook Receiver → Service Bus Queue    │
│       │                                  │
│       ▼                                  │
│  Alert Processor Workers (auto-scale)    │
│       │                                  │
│       ├─ Load org config (Cosmos DB)      │
│       ├─ Get Jira creds (Key Vault)       │
│       ├─ Normalize alert                  │
│       ├─ Check duplicates                 │
│       ├─ Extract user story from PR       │
│       ├─ Create Jira issue                │
│       ├─ Link to user story / EPIC        │
│       ├─ Post PR comment                  │
│       └─ Send Slack/Teams notification    │
└─────────────────────────────────────────┘
    │
    ▼
Jira Cloud (per-org instances)
```

## Project Structure

```
enterprise-app/
├── src/
│   ├── index.ts                       # App entry point (Express server + workers)
│   ├── config/
│   │   ├── app-config.ts              # Environment config loader
│   │   └── defaults.ts                # Default org configuration
│   ├── models/
│   │   ├── alert.ts                   # Normalized alert types
│   │   ├── org-config.ts              # Org configuration schema
│   │   └── processing-log.ts          # Audit log types
│   ├── utils/
│   │   ├── logger.ts                  # Structured JSON logger
│   │   ├── sanitization.ts            # Input sanitization
│   │   ├── jira-key-extractor.ts      # User story extraction
│   │   └── severity.ts                # Severity mapping
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── github.ts              # Webhook receiver endpoint
│   │   │   └── signature.ts           # HMAC-SHA256 verification
│   │   ├── admin/
│   │   │   ├── config.ts              # Org config CRUD API
│   │   │   └── health.ts              # Health check endpoint
│   │   └── middleware/
│   │       ├── error-handler.ts       # Global error handler
│   │       └── rate-limit.ts          # Rate limiting
│   ├── services/
│   │   ├── github/
│   │   │   ├── auth.ts                # JWT + installation token generation
│   │   │   ├── client.ts              # Octokit client factory
│   │   │   └── pr-service.ts          # PR details, commits, comments
│   │   ├── jira/
│   │   │   ├── client.ts              # Jira API client with retry
│   │   │   ├── issue-service.ts       # Issue creation, linking, remote links
│   │   │   ├── dedup-service.ts       # Duplicate detection via JQL
│   │   │   └── epic-resolver.ts       # EPIC hierarchy traversal
│   │   ├── config/
│   │   │   └── config-service.ts      # Cosmos DB org config
│   │   ├── queue/
│   │   │   └── queue-service.ts       # Service Bus queues
│   │   ├── secrets/
│   │   │   └── secrets-service.ts     # Key Vault secrets
│   │   └── notification/
│   │       ├── slack.ts               # Slack webhooks
│   │       └── teams.ts               # Teams webhooks
│   └── workers/
│       ├── alert-normalizer.ts        # Alert payload normalization
│       └── alert-processor.ts         # Queue worker (main processing)
├── tests/
│   └── unit/
│       ├── sanitization.test.ts
│       ├── jira-key-extractor.test.ts
│       ├── webhook-signature.test.ts
│       ├── alert-normalizer.test.ts
│       └── severity.test.ts
├── infra/
│   ├── main.bicep                     # Main infrastructure orchestrator
│   ├── main.bicepparam                # Default parameters
│   └── modules/
│       ├── managed-identity.bicep
│       ├── app-insights.bicep
│       ├── key-vault.bicep
│       ├── cosmos-db.bicep
│       ├── service-bus.bicep
│       └── container-apps.bicep
├── Dockerfile
├── docker-compose.yml
├── azure.yaml
├── package.json
└── tsconfig.json
```

## Prerequisites

- **Node.js 20+**
- **Azure subscription** with permissions to create resources
- **GitHub Enterprise Cloud** account
- **Azure CLI** (`az`) and **Azure Developer CLI** (`azd`) installed
- **Jira Cloud** instances for each org

## Quick Start

### 1. Register the Enterprise GitHub App

1. Go to **Enterprise Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Set:
   - **Name**: `Enterprise Security to Jira`
   - **Webhook URL**: `https://<your-domain>/api/webhooks/github`
   - **Webhook Secret**: Generate a strong random secret
3. **Repository Permissions**:
   - Code scanning alerts: `Read`
   - Secret scanning alerts: `Read`
   - Dependabot alerts: `Read`
   - Contents: `Read`
   - Pull requests: `Write`
   - Issues: `Write`
4. **Subscribe to events**: `code_scanning_alert`, `secret_scanning_alert`, `dependabot_alert`, `installation`
5. Visibility: Only enterprise organizations
6. Generate and download the private key

### 2. Deploy Azure Infrastructure

```bash
cd enterprise-app

# Login to Azure
az login

# Create resource group
az group create --name rg-security-jira-dev --location eastus2

# Deploy infrastructure
az deployment group create \
  --resource-group rg-security-jira-dev \
  --template-file infra/main.bicep \
  --parameters environmentName=dev
```

### 3. Store Secrets in Key Vault

```bash
# Store GitHub App private key
az keyvault secret set --vault-name kv-secjira-dev \
  --name github-app-private-key \
  --file private-key.pem

# Store Jira credentials for each org (as JSON)
az keyvault secret set --vault-name kv-secjira-dev \
  --name jira-acme-corp \
  --value '{"userEmail":"bot@acme.com","apiToken":"ATATT3x..."}'
```

### 4. Configure and Deploy the App

```bash
# Copy env file
cp .env.example .env
# Edit with your values

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run dev

# OR deploy with azd
azd up
```

### 5. Install the App on Organizations

For each org in the enterprise:
1. Go to the GitHub App settings page
2. Click **Install App**
3. Select the org and choose **All repositories** or specific repos
4. The app auto-provisions the org config in Cosmos DB

## Configuration

### Per-Org Configuration

Use the Admin API to configure each org:

```bash
curl -X PUT https://<app-url>/api/admin/config/orgs/acme-corp \
  -H 'Content-Type: application/json' \
  -d '{
    "jira": {
      "credentialRef": "jira-acme-corp",
      "baseUrl": "https://acme-corp.atlassian.net",
      "defaultProject": "SEC"
    },
    "alerts": {
      "code_scanning": { "enabled": true, "severityThreshold": "medium" },
      "secret_scanning": { "enabled": true, "severityThreshold": "low" },
      "dependabot": { "enabled": true, "severityThreshold": "high" }
    }
  }'
```

### Notification Webhooks

Store webhook URLs in Key Vault, then reference them in org config:

```bash
az keyvault secret set --vault-name kv-secjira-dev \
  --name slack-acme-corp \
  --value 'https://hooks.slack.com/services/T00/B00/xxx'
```

```json
{
  "notifications": {
    "slack": { "enabled": true, "webhookRef": "slack-acme-corp" }
  }
}
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /health` | GET | Health check |
| `POST /api/webhooks/github` | POST | GitHub webhook receiver |
| `GET /api/admin/config/orgs` | GET | List all org configs |
| `GET /api/admin/config/orgs/:org` | GET | Get org config |
| `PUT /api/admin/config/orgs/:org` | PUT | Update org config |

## Security

- **Webhook verification**: HMAC-SHA256 signature check on every request
- **No stored credentials in code**: All secrets in Azure Key Vault
- **Managed Identity**: No credential files for Azure services
- **Input sanitization**: All alert data sanitized before use
- **Rate limiting**: Webhook and admin endpoints rate-limited
- **Helmet.js**: HTTP security headers
- **Non-root container**: Docker runs as `appuser`
- **TLS**: All external connections over HTTPS

## Testing

```bash
npm test              # All tests with coverage
npm run test:unit     # Unit tests only
npm run typecheck     # TypeScript type checking
```

## License

MIT
