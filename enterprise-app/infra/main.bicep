targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environmentName string

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Base name for all resources')
param baseName string = 'security-jira'

// ---------- Modules ----------

module managedIdentity 'modules/managed-identity.bicep' = {
  name: 'managed-identity'
  params: {
    name: 'id-${baseName}-${environmentName}'
    location: location
  }
}

module appInsights 'modules/app-insights.bicep' = {
  name: 'app-insights'
  params: {
    name: 'ai-${baseName}-${environmentName}'
    logAnalyticsName: 'log-${baseName}-${environmentName}'
    location: location
  }
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    name: 'kv-secjira-${environmentName}'
    location: location
    principalId: managedIdentity.outputs.principalId
  }
}

module cosmosDb 'modules/cosmos-db.bicep' = {
  name: 'cosmos-db'
  params: {
    name: 'cosmos-${baseName}-${environmentName}'
    location: location
    databaseName: 'security-jira'
    principalId: managedIdentity.outputs.principalId
  }
}

module serviceBus 'modules/service-bus.bicep' = {
  name: 'service-bus'
  params: {
    name: 'sb-${baseName}-${environmentName}'
    location: location
    principalId: managedIdentity.outputs.principalId
  }
}

module containerApp 'modules/container-apps.bicep' = {
  name: 'container-apps'
  params: {
    name: 'ca-${baseName}-${environmentName}'
    location: location
    environmentName: environmentName
    managedIdentityId: managedIdentity.outputs.id
    managedIdentityClientId: managedIdentity.outputs.clientId
    appInsightsConnectionString: appInsights.outputs.connectionString
    cosmosEndpoint: cosmosDb.outputs.endpoint
    keyVaultUrl: keyVault.outputs.vaultUri
    serviceBusNamespace: serviceBus.outputs.namespace
  }
}

// ---------- Outputs ----------

output containerAppUrl string = containerApp.outputs.fqdn
output cosmosEndpoint string = cosmosDb.outputs.endpoint
output keyVaultUrl string = keyVault.outputs.vaultUri
output serviceBusNamespace string = serviceBus.outputs.namespace
output appInsightsConnectionString string = appInsights.outputs.connectionString
