export type DocumentStatus = 'uploaded' | 'extracted' | 'draft_created';

export type OcrSource = 'azure_document_intelligence' | 'manual_override';
export type ExtractionProfile = 'template_a_municipal_notice' | 'generic_fallback';

export interface ExtractedField {
  value: string;
  confidence: number;
  sourceText: string;
}

export interface FineExtraction {
  ocrSource: OcrSource;
  profile: ExtractionProfile;
  rawText: string;
  vehicleNumber: ExtractedField;
  paymentDeadline: ExtractedField;
  violationDetails: ExtractedField;
  overallConfidence: number;
  requiresHumanReview: boolean;
  matchedAnchors: string[];
}

export interface DraftResult {
  provider: 'microsoft_graph';
  draftId: string;
  webLink: string | null;
  mailboxUser: string;
  createdAt: string;
  sendPolicy: 'manual_only';
  mode: 'live' | 'mock';
}

export interface AuditEntry {
  at: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
}

export interface FineDocumentRecord {
  id: string;
  originalFileName: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  status: DocumentStatus;
  storedFilePath: string;
  extraction: FineExtraction | null;
  selectedFields: {
    vehicleNumber: string;
    paymentDeadline: string;
    violationDetails: string;
  } | null;
  recipientEmail: string | null;
  draftResult: DraftResult | null;
  auditLog: AuditEntry[];
}

export interface VehicleEmailMappingRow {
  vehicleNumber: string;
  vehicleNumberNormalized: string;
  email: string;
  employeeId: string;
  employeeName: string;
  status: 'active' | 'inactive';
  updatedAt: string;
}

export interface MappingImportReport {
  totalRows: number;
  importedRows: number;
  rejectedRows: number;
  duplicateVehicleNumbers: string[];
  errors: string[];
}
