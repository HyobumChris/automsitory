import { randomUUID } from 'node:crypto';
import type { DraftResult } from '@/lib/fine/types';

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailboxUserId: string;
}

function readGraphConfig(): GraphConfig | null {
  const tenantId = process.env.MS365_TENANT_ID;
  const clientId = process.env.MS365_CLIENT_ID;
  const clientSecret = process.env.MS365_CLIENT_SECRET;
  const mailboxUserId = process.env.MS365_MAILBOX_USER_ID;
  if (!tenantId || !clientId || !clientSecret || !mailboxUserId) {
    return null;
  }
  return { tenantId, clientId, clientSecret, mailboxUserId };
}

async function getAccessToken(config: GraphConfig): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to acquire Graph token: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('Graph token response did not include access_token.');
  }
  return payload.access_token;
}

async function createMessage(
  token: string,
  config: GraphConfig,
  params: { recipientEmail: string; subject: string; bodyText: string },
): Promise<{ id: string; webLink: string | null }> {
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${config.mailboxUserId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: params.subject,
      body: {
        contentType: 'Text',
        content: params.bodyText,
      },
      toRecipients: [
        {
          emailAddress: {
            address: params.recipientEmail,
          },
        },
      ],
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Graph draft creation failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { id: string; webLink?: string };
  return {
    id: payload.id,
    webLink: payload.webLink ?? null,
  };
}

async function addAttachment(
  token: string,
  config: GraphConfig,
  messageId: string,
  attachment: { fileName: string; mimeType: string; fileBytes: Buffer },
): Promise<void> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${config.mailboxUserId}/messages/${messageId}/attachments`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.fileName,
        contentType: attachment.mimeType || 'application/octet-stream',
        contentBytes: attachment.fileBytes.toString('base64'),
      }),
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error(`Graph attachment upload failed: ${response.status} ${await response.text()}`);
  }
}

export async function createOutlookDraft(params: {
  recipientEmail: string;
  subject: string;
  bodyText: string;
  attachment: { fileName: string; mimeType: string; fileBytes: Buffer };
}): Promise<DraftResult> {
  const config = readGraphConfig();
  if (!config) {
    return {
      provider: 'microsoft_graph',
      draftId: `mock-${randomUUID()}`,
      webLink: null,
      mailboxUser: 'mock-mailbox',
      createdAt: new Date().toISOString(),
      sendPolicy: 'manual_only',
      mode: 'mock',
    };
  }

  const token = await getAccessToken(config);
  const message = await createMessage(token, config, params);
  await addAttachment(token, config, message.id, params.attachment);

  return {
    provider: 'microsoft_graph',
    draftId: message.id,
    webLink: message.webLink,
    mailboxUser: config.mailboxUserId,
    createdAt: new Date().toISOString(),
    sendPolicy: 'manual_only',
    mode: 'live',
  };
}
