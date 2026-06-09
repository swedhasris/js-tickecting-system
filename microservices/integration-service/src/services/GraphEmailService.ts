import { execute } from '../lib/db.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function isConfigured(): boolean {
  const { GRAPH_TENANT_ID: t, GRAPH_CLIENT_ID: c, GRAPH_CLIENT_SECRET: s } = process.env;
  return !!(t && t !== 'your_tenant_id_here' && c && c !== 'your_client_id_here' && s && s !== 'your_client_secret_here');
}

let _tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 120_000) return _tokenCache.token;

  const { GRAPH_TENANT_ID: tid, GRAPH_CLIENT_ID: cid, GRAPH_CLIENT_SECRET: cs } = process.env;
  if (!tid || !cid || !cs) throw new Error('Graph API credentials not configured in .env');

  const params = new URLSearchParams({
    grant_type: 'client_credentials', client_id: cid!, client_secret: cs!,
    scope: 'https://graph.microsoft.com/.default',
  });
  const res  = await fetch(`https://login.microsoftonline.com/${tid}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  const data = await res.json() as any;
  _tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in - 60) * 1000 };
  return _tokenCache.token;
}

export async function sendViaGraph(params: {
  to: string | string[]; subject: string; html: string;
  ticketNumber?: string; replyToMsgId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!isConfigured()) return { ok: false, error: 'Graph API not configured' };

  const userEmail = process.env.GRAPH_USER_EMAIL || 'support@technosprint.net';
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const toAddresses = recipients.filter(e => e?.includes('@')).map(e => ({ emailAddress: { address: e.trim() } }));

  if (!toAddresses.length) return { ok: false, error: 'No valid recipients' };

  try {
    const token = await getToken();
    const message: any = {
      subject: params.subject,
      importance: 'normal',
      body: { contentType: 'HTML', content: params.html },
      toRecipients: toAddresses,
      from: { emailAddress: { address: userEmail, name: 'Technosprint Support' } },
      replyTo: [{ emailAddress: { address: userEmail, name: 'Technosprint Support' } }],
    };
    if (params.ticketNumber) {
      message.internetMessageHeaders = [{ name: 'X-Ticket-Number', value: params.ticketNumber }];
    }

    const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(userEmail)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!res.ok) throw new Error(`Graph sendMail (${res.status}): ${await res.text()}`);

    const msgId = `<graph-${Date.now()}@technosprint.net>`;
    await logGraphEvent('email_sent', 'outbound', 'sent', { sender: userEmail, recipient: recipients.join(', '), subject: params.subject, message_id: msgId, ticket_number: params.ticketNumber });
    console.log(`[Graph] ✓ Email sent → ${recipients.join(', ')}`);
    return { ok: true, messageId: msgId };
  } catch (e: any) {
    await logGraphEvent('email_sent', 'outbound', 'failed', { error_msg: e.message });
    return { ok: false, error: e.message };
  }
}

export async function testGraphConnection(): Promise<{ ok: boolean; msg: string }> {
  if (!isConfigured()) return { ok: false, msg: 'GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET not set' };
  try {
    const token     = await getToken();
    const userEmail = process.env.GRAPH_USER_EMAIL || 'support@technosprint.net';
    const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(userEmail)}/mailboxSettings`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Mailbox access failed (${res.status}): ${await res.text()}`);
    await logGraphEvent('graph_test', 'outbound', 'success', {});
    return { ok: true, msg: `Graph API connected — mailbox: ${userEmail}` };
  } catch (e: any) {
    await logGraphEvent('graph_test', 'outbound', 'failed', { error_msg: e.message });
    return { ok: false, msg: e.message };
  }
}

export async function getGraphHealth() {
  return {
    configured: isConfigured(),
    connected: null,
    userEmail: process.env.GRAPH_USER_EMAIL || 'support@technosprint.net',
    tenantId: process.env.GRAPH_TENANT_ID || 'not set',
    error: isConfigured() ? undefined : 'GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET not set in .env',
  };
}

export function getGraphSetup() {
  return {
    status: isConfigured() ? 'configured' : 'not_configured',
    current_auth_method: isConfigured() ? 'Microsoft Graph API (OAuth2)' : 'Basic Auth (blocked by tenant)',
    setup_steps: [
      '1. Go to https://portal.azure.com → Azure Active Directory → App Registrations',
      '2. New registration → Name: "Ticklora Email" → Single tenant → Register',
      '3. Certificates & secrets → New client secret → copy the Value',
      '4. API permissions → Microsoft Graph → Application → Mail.Send + Mail.ReadWrite → Grant admin consent',
      '5. Copy Tenant ID and Client ID from App Overview',
      '6. Add to .env: GRAPH_TENANT_ID=... GRAPH_CLIENT_ID=... GRAPH_CLIENT_SECRET=...',
      '7. Restart server → test with: POST /api/graph/test',
    ],
    env_vars_needed: {
      GRAPH_TENANT_ID:     process.env.GRAPH_TENANT_ID     || 'NOT SET',
      GRAPH_CLIENT_ID:     process.env.GRAPH_CLIENT_ID     || 'NOT SET',
      GRAPH_CLIENT_SECRET: process.env.GRAPH_CLIENT_SECRET ? '*** (set)' : 'NOT SET',
      GRAPH_USER_EMAIL:    process.env.GRAPH_USER_EMAIL     || 'support@technosprint.net',
    },
    portal_links: {
      app_registrations: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps',
      graph_explorer:    'https://developer.microsoft.com/graph/graph-explorer',
    },
  };
}

async function logGraphEvent(eventType: string, direction: string, status: string, data: any) {
  try {
    await execute(
      'INSERT INTO m365_email_audit (event_type, direction, status, ticket_number, sender, recipient, subject, message_id, error_msg) VALUES (?,?,?,?,?,?,?,?,?)',
      [eventType, direction, status, data.ticket_number||null, data.sender||null, data.recipient||null, data.subject||null, data.message_id||null, data.error_msg||null]
    );
  } catch { /* non-critical */ }
}
