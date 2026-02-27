@description('Container App name')
param name string

@description('Location')
param location string

@description('Environment name')
param environmentName string

@description('User-assigned managed identity resource ID')
param managedIdentityId string

@description('Managed identity client ID')
param managedIdentityClientId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Cosmos DB endpoint')
param cosmosEndpoint string

@description('Key Vault URL')
param keyVaultUrl string

@description('Service Bus namespace')
param serviceBusNamespace string

resource containerAppEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${name}'
  location: location
  properties: {}
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    environmentId: containerAppEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      secrets: [
        {
          name: 'github-app-id'
          value: 'PLACEHOLDER_SET_AFTER_DEPLOY'
        }
        {
          name: 'github-webhook-secret'
          value: 'PLACEHOLDER_SET_AFTER_DEPLOY'
        }
        {
          name: 'github-private-key'
          value: 'PLACEHOLDER_SET_AFTER_DEPLOY'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest' // Placeholder
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: environmentName }
            { name: 'PORT', value: '3000' }
            { name: 'AZURE_COSMOS_ENDPOINT', value: cosmosEndpoint }
            { name: 'AZURE_COSMOS_DATABASE', value: 'security-jira' }
            { name: 'AZURE_KEYVAULT_URL', value: keyVaultUrl }
            { name: 'AZURE_SERVICEBUS_NAMESPACE', value: serviceBusNamespace }
            { name: 'AZURE_CLIENT_ID', value: managedIdentityClientId }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
            { name: 'GITHUB_APP_ID', secretRef: 'github-app-id' }
            { name: 'GITHUB_WEBHOOK_SECRET', secretRef: 'github-webhook-secret' }
            { name: 'GITHUB_APP_PRIVATE_KEY', secretRef: 'github-private-key' }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

output fqdn string = containerApp.properties.configuration.ingress.fqdn
