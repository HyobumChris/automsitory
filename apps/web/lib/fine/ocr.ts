interface AzureAnalyzeResult {
  status: 'notStarted' | 'running' | 'succeeded' | 'failed';
  analyzeResult?: {
    content?: string;
  };
}

function azureOcrConfig(): { endpoint: string; key: string; apiVersion: string } | null {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? '2024-11-30';
  if (!endpoint || !key) {
    return null;
  }
  return { endpoint, key, apiVersion };
}

async function pollAnalyzeResult(operationLocation: string, key: string): Promise<string> {
  const maxAttempts = 20;
  const sleepMs = 1200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(operationLocation, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Azure OCR polling failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as AzureAnalyzeResult;
    if (data.status === 'succeeded') {
      return data.analyzeResult?.content ?? '';
    }
    if (data.status === 'failed') {
      throw new Error('Azure OCR analyze request failed.');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, sleepMs);
    });
  }

  throw new Error('Azure OCR polling timed out.');
}

async function runAzureDocumentIntelligence(fileBytes: Buffer, mimeType: string): Promise<string> {
  const config = azureOcrConfig();
  if (!config) {
    throw new Error('Azure OCR is not configured.');
  }

  const endpoint = config.endpoint.replace(/\/+$/, '');
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${config.apiVersion}`;
  const response = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'Ocp-Apim-Subscription-Key': config.key,
    },
    body: fileBytes as unknown as BodyInit,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Azure OCR analyze request failed: ${response.status} ${await response.text()}`);
  }

  const operationLocation = response.headers.get('operation-location');
  if (!operationLocation) {
    throw new Error('Azure OCR response missing operation-location header.');
  }

  return pollAnalyzeResult(operationLocation, config.key);
}

function shouldDecodeAsUtf8(mimeType: string, fileName: string): boolean {
  if (mimeType.startsWith('text/')) {
    return true;
  }
  const lower = fileName.toLowerCase();
  return lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.json');
}

export async function extractRawTextFromDocument(params: {
  fileBytes: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ rawText: string; source: 'azure_document_intelligence' }> {
  if (shouldDecodeAsUtf8(params.mimeType, params.fileName)) {
    return {
      rawText: params.fileBytes.toString('utf-8'),
      source: 'azure_document_intelligence',
    };
  }

  const rawText = await runAzureDocumentIntelligence(params.fileBytes, params.mimeType);
  return {
    rawText,
    source: 'azure_document_intelligence',
  };
}
