import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AuditEntry, FineDocumentRecord } from '@/lib/fine/types';

const DATA_ROOT = path.join(process.cwd(), '.data', 'fine-draft');
const DOCUMENTS_ROOT = path.join(DATA_ROOT, 'documents');

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function documentDirectory(documentId: string): string {
  return path.join(DOCUMENTS_ROOT, documentId);
}

function documentJsonPath(documentId: string): string {
  return path.join(documentDirectory(documentId), 'record.json');
}

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DOCUMENTS_ROOT, { recursive: true });
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function appendAudit(
  existing: AuditEntry[],
  action: string,
  actor: string,
  details?: Record<string, unknown>,
): AuditEntry[] {
  return [
    ...existing,
    {
      at: new Date().toISOString(),
      action,
      actor,
      details,
    },
  ];
}

export async function createFineDocumentRecord(params: {
  originalFileName: string;
  mimeType: string;
  uploadedBy: string;
  fileBuffer: Buffer;
}): Promise<FineDocumentRecord> {
  await ensureDirectories();
  const id = randomUUID();
  const dir = documentDirectory(id);
  await fs.mkdir(dir, { recursive: true });

  const safeName = sanitizeFileName(params.originalFileName);
  const savedFilePath = path.join(dir, safeName);
  await fs.writeFile(savedFilePath, params.fileBuffer);

  const now = new Date().toISOString();
  const record: FineDocumentRecord = {
    id,
    originalFileName: params.originalFileName,
    mimeType: params.mimeType,
    uploadedBy: params.uploadedBy,
    uploadedAt: now,
    status: 'uploaded',
    storedFilePath: savedFilePath,
    extraction: null,
    selectedFields: null,
    recipientEmail: null,
    draftResult: null,
    auditLog: [
      {
        at: now,
        action: 'document_uploaded',
        actor: params.uploadedBy,
        details: {
          mimeType: params.mimeType,
        },
      },
    ],
  };

  await writeJson(documentJsonPath(id), record);
  return record;
}

export async function getFineDocumentRecord(documentId: string): Promise<FineDocumentRecord | null> {
  try {
    const raw = await fs.readFile(documentJsonPath(documentId), 'utf-8');
    return JSON.parse(raw) as FineDocumentRecord;
  } catch {
    return null;
  }
}

export async function updateFineDocumentRecord(
  documentId: string,
  updater: (record: FineDocumentRecord) => FineDocumentRecord,
): Promise<FineDocumentRecord> {
  const existing = await getFineDocumentRecord(documentId);
  if (!existing) {
    throw new Error(`Document not found: ${documentId}`);
  }
  const updated = updater(existing);
  await writeJson(documentJsonPath(documentId), updated);
  return updated;
}

export async function readStoredDocumentFile(documentId: string): Promise<Buffer> {
  const existing = await getFineDocumentRecord(documentId);
  if (!existing) {
    throw new Error(`Document not found: ${documentId}`);
  }
  return fs.readFile(existing.storedFilePath);
}

export async function addAuditLogEntry(params: {
  documentId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
}): Promise<FineDocumentRecord> {
  return updateFineDocumentRecord(params.documentId, (record) => ({
    ...record,
    auditLog: appendAudit(record.auditLog, params.action, params.actor, params.details),
  }));
}

export function fineDataRootPath(): string {
  return DATA_ROOT;
}

export async function listFineDocumentRecords(limit = 50): Promise<FineDocumentRecord[]> {
  await ensureDirectories();
  const documentIds = await fs.readdir(DOCUMENTS_ROOT, { withFileTypes: true });
  const records: FineDocumentRecord[] = [];

  for (const entry of documentIds) {
    if (!entry.isDirectory()) {
      continue;
    }
    const record = await getFineDocumentRecord(entry.name);
    if (record) {
      records.push(record);
    }
  }

  return records
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, Math.max(1, limit));
}

export async function summarizeFineDocumentStatuses(): Promise<Record<string, number>> {
  const records = await listFineDocumentRecords(1000);
  return records.reduce<Record<string, number>>((acc, record) => {
    acc[record.status] = (acc[record.status] ?? 0) + 1;
    return acc;
  }, {});
}

export async function purgeFineDocumentRecords(params: {
  olderThanDays: number;
  statuses?: string[];
}): Promise<{ purgedCount: number; purgedIds: string[] }> {
  const olderThanDays = Math.max(0, Math.floor(params.olderThanDays));
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const statusSet = params.statuses?.length ? new Set(params.statuses) : null;

  const records = await listFineDocumentRecords(5000);
  const targetRecords = records.filter((record) => {
    const uploadedTs = Date.parse(record.uploadedAt);
    if (Number.isNaN(uploadedTs)) {
      return false;
    }
    if (uploadedTs > cutoff) {
      return false;
    }
    if (statusSet && !statusSet.has(record.status)) {
      return false;
    }
    return true;
  });

  for (const record of targetRecords) {
    await fs.rm(documentDirectory(record.id), { recursive: true, force: true });
  }

  return {
    purgedCount: targetRecords.length,
    purgedIds: targetRecords.map((record) => record.id),
  };
}
