@description('Service Bus namespace name')
param name string

@description('Location')
param location string

@description('Principal ID for RBAC')
param principalId string

resource serviceBus 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: name
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
}

// Priority queues
var queueNames = [
  'alerts-critical'
  'alerts-high'
  'alerts-medium'
  'alerts-low'
]

resource queues 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = [for queueName in queueNames: {
  parent: serviceBus
  name: queueName
  properties: {
    maxDeliveryCount: 10
    lockDuration: 'PT5M'
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
  }
}]

// Grant Azure Service Bus Data Owner role
resource sbRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(serviceBus.id, principalId, '090c5cfd-751d-490a-894a-3ce6f1109419')
  scope: serviceBus
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '090c5cfd-751d-490a-894a-3ce6f1109419') // Azure Service Bus Data Owner
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output namespace string = '${serviceBus.name}.servicebus.windows.net'
