export const FINE_DRAFT_POLICY = {
  emailProvider: 'microsoft_graph',
  sendPolicy: 'manual_only',
  ocrEngine: 'azure_document_intelligence',
  mappingIngestion: 'admin_csv_upload',
  deploymentTarget: 'azure_container_apps',
  retention: {
    defaultPurgeDays: 90,
    defaultPurgeStatuses: ['on_hold', 'draft_created'],
  },
} as const;
