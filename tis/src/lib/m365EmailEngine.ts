/**
 * Microsoft 365 Domain Email Engine
 * Provider: Microsoft 365 | Domain: technosprint.net
 * Mailbox: support@technosprint.net
 *
 * Incoming: outlook.office365.com:993 (IMAP / SSL-TLS)
 * Outgoing: smtp.office365.com:587    (SMTP / STARTTLS)
 *
 * This module is ADDITIVE — it does not modify any existing email engine.
 * It provides M365-specific helpers consumed by new API routes only.
 */

import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { execute, query, formatDate } from './db';

// ─── Config snapshot ──────────────────────────────────────────────────────────

export const M365_CONFIG = {
  COMPANY_NAME:    'Technosprint',
  EMAIL_ADDRESS:   'support@technosprint.net',
  SMTP_HOST:       'smtp.office365.com',
  SMTP_PORT:       587,
  SMTP_ENCRYPTION: 'STARTTLS',
  IMAP_HOST:       'outlook.office365.com',
  IMAP_PORT:       993,
  IMAP_ENCRYPTION: 'SSL',
} as const;

// ─── Audit Log Table Name ─────────────────────────────────────────────────────
export const M365_AUDIT_TABLE = 'm365_email_audit';

// ─── Ensure audit table exists ────────────────────────────────────────────────
export async function ensureM365AuditTable() {
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS ${M365_AUDIT_TABLE} (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type  TEXT    NOT NULL,
        direction   TEXT    NOT NULL DEFAULT 'outbound',
        status      TEXT    NOT NULL DEFAULT 'pending',
        ticket_id   TEXT,
        ticket_number TEXT,
        sender      TEXT,
        recipient   TEXT,
        subject     TEXT,
        message_id  TEXT,
        error_msg   TEXT,
        retry_count INTEGER DEFAULT 0,
        metadata_json TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // MySQL variant
    await execute(`
      CREATE TABLE IF NOT EXISTS ${M365_AUDIT_TABLE} (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        event_type  VARCHAR(100)   NOT NULL,
        direction   VARCHAR(20)    NOT NULL DEFAULT 'outbound',
        status      VARCHAR(30)    NOT NULL DEFAULT 'pending',
        ticket_id   VARCHAR(128),
        ticket_number VARCHAR(64),
        sender      VARCHAR(255),
        recipient   VARCHAR(255),
        subject     VARCHAR(500),
        message_id  VARCHAR(255),
        error_msg   TEXT,
        retry_count INT     DEFAULT 0,
        metadata_json LONGTEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_m365_event   (event_type),
        INDEX idx_m365_status  (status),
        INDEX idx_m365_ticket  (ticket_number),
        INDEX idx_m365_created (created_at)
      ) ENGINE=InnoDB
    `);
  } catch (_) {
    // Silently ignore — one of the two CREATE TABLE statements will succeed
    // depending on whether we're on MySQL or SQLite.
  }
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

export async function logM365Event(data: {
  event_type: string;
  direction?: string;
  status: string;
  ticket_id?: string | number;
  ticket_number?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  message_id?: string;
  error_msg?: string;
  retry_count?: number;
  metadata?: Record<string, any>;
}) {
  try {
    await execute(
      `INSERT INTO ${M365_AUDIT_TABLE}
        (event_type, direction, status, ticket_id, ticket_number, sender, recipient, subject, message_id, error_msg, retry_count, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.event_type,
        data.direction ?? 'outbound',
        data.status,
        data.ticket_id    ? String(data.ticket_id) : null,
        data.ticket_number ?? null,
        data.sender        ?? null,
        data.recipient     ?? null,
        data.subject       ?? null,
        data.message_id    ?? null,
        data.error_msg     ?? null,
        data.retry_count   ?? 0,
        data.metadata      ? JSON.stringify(data.metadata) : null,
      ]
    );
  } catch (e: any) {
    console.error('[M365Audit] Log error:', e.message);
  }
}

// ─── Create M365 SMTP Transporter ─────────────────────────────────────────────

function getM365Transporter(smtpUser: string, smtpPass: string) {
  return nodemailer.createTransport({
    host:   M365_CONFIG.SMTP_HOST,
    port:   M365_CONFIG.SMTP_PORT,
    secure: false,                       // STARTTLS — not SSL on 587
    auth:   { user: smtpUser, pass: smtpPass },
    tls:    { ciphers: 'SSLv3', rejectUnauthorized: false },
  });
}

// ─── SMTP connectivity test ───────────────────────────────────────────────────

export async function testM365Smtp(smtpUser: string, smtpPass: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const t = getM365Transporter(smtpUser, smtpPass);
    await t.verify();
    await logM365Event({ event_type: 'smtp_test', direction: 'outbound', status: 'success', sender: smtpUser });
    return { ok: true, msg: 'SMTP connection to smtp.office365.com:587 verified.' };
  } catch (e: any) {
    await logM365Event({ event_type: 'smtp_test', direction: 'outbound', status: 'failed', sender: smtpUser, error_msg: e.message });
    return { ok: false, msg: e.message };
  }
}

// ─── IMAP connectivity test ───────────────────────────────────────────────────

export async function testM365Imap(imapUser: string, imapPass: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const cfg = {
      imap: {
        user:         imapUser,
        password:     imapPass,
        host:         M365_CONFIG.IMAP_HOST,
        port:         M365_CONFIG.IMAP_PORT,
        tls:          true,
        tlsOptions:   { rejectUnauthorized: false },
        authTimeout:  12000,
      },
    };
    const conn = await imaps.connect(cfg);
    conn.end();
    await logM365Event({ event_type: 'imap_test', direction: 'inbound', status: 'success', sender: imapUser });
    return { ok: true, msg: 'IMAP connection to outlook.office365.com:993 verified.' };
  } catch (e: any) {
    await logM365Event({ event_type: 'imap_test', direction: 'inbound', status: 'failed', sender: imapUser, error_msg: e.message });
    return { ok: false, msg: e.message };
  }
}

// ─── Send via M365 SMTP ───────────────────────────────────────────────────────

export async function sendViaM365(params: {
  smtpUser: string;
  smtpPass: string;
  to:       string;
  subject:  string;
  html:     string;
  ticketNumber?: string;
  replyToMessageId?: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { smtpUser, smtpPass, to, subject, html, ticketNumber, replyToMessageId } = params;
  try {
    const t = getM365Transporter(smtpUser, smtpPass);
    const mailOpts: any = {
      from:    `"Technosprint Support" <${smtpUser}>`,
      to,
      subject,
      html,
    };
    if (ticketNumber) {
      mailOpts.headers = { 'X-Ticket-Number': ticketNumber };
    }
    if (replyToMessageId) {
      mailOpts.inReplyTo  = replyToMessageId;
      mailOpts.references = replyToMessageId;
    }
    const info = await t.sendMail(mailOpts);
    await logM365Event({
      event_type: 'email_sent', direction: 'outbound', status: 'sent',
      ticket_number: ticketNumber, sender: smtpUser, recipient: to,
      subject, message_id: info.messageId,
    });
    console.log(`[M365] Email sent to ${to} — messageId: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    await logM365Event({
      event_type: 'email_sent', direction: 'outbound', status: 'failed',
      ticket_number: ticketNumber, sender: smtpUser, recipient: to,
      subject, error_msg: e.message,
    });
    console.error('[M365] Send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function getM365Health(config: {
  smtpUser: string; smtpPass: string;
  imapUser: string; imapPass: string;
}): Promise<{
  status: 'healthy' | 'degraded' | 'unreachable';
  smtp:  { connected: boolean; host: string; port: number };
  imap:  { connected: boolean; host: string; port: number };
  stats: { sent_24h: number; received_24h: number; failed_24h: number };
  lastPollTime: string | null;
  queuePending: number;
  queueFailed:  number;
}> {
  const [smtpResult, imapResult] = await Promise.allSettled([
    testM365Smtp(config.smtpUser, config.smtpPass),
    testM365Imap(config.imapUser, config.imapPass),
  ]);

  const smtpOk = smtpResult.status === 'fulfilled' && smtpResult.value.ok;
  const imapOk = imapResult.status === 'fulfilled' && imapResult.value.ok;

  // Pull stats from m365_email_audit
  let sent24h = 0, received24h = 0, failed24h = 0, lastPoll: string | null = null;
  try {
    const s = await query(
      `SELECT status, direction, COUNT(*) as cnt FROM ${M365_AUDIT_TABLE}
       WHERE created_at >= datetime('now', '-24 hours') OR created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       GROUP BY status, direction`
    );
    s.forEach((r: any) => {
      if (r.direction === 'outbound' && r.status === 'sent')    sent24h    += Number(r.cnt);
      if (r.direction === 'inbound'  && r.status === 'success') received24h += Number(r.cnt);
      if (r.status === 'failed')                                failed24h   += Number(r.cnt);
    });
    const lp = await query(
      `SELECT MAX(created_at) as last FROM ${M365_AUDIT_TABLE} WHERE direction = 'inbound'`
    );
    lastPoll = lp[0]?.last ?? null;
  } catch { /* ignore */ }

  // Pull queue stats from notifications_queue (shared queue)
  let queuePending = 0, queueFailed = 0;
  try {
    const qs = await query(
      `SELECT status, COUNT(*) as cnt FROM notifications_queue
       WHERE recipient LIKE '%technosprint.net%' GROUP BY status`
    );
    qs.forEach((r: any) => {
      if (r.status === 'pending') queuePending += Number(r.cnt);
      if (r.status === 'failed')  queueFailed  += Number(r.cnt);
    });
  } catch { /* ignore */ }

  return {
    status:       smtpOk && imapOk ? 'healthy' : (smtpOk || imapOk ? 'degraded' : 'unreachable'),
    smtp:         { connected: smtpOk, host: M365_CONFIG.SMTP_HOST, port: M365_CONFIG.SMTP_PORT },
    imap:         { connected: imapOk, host: M365_CONFIG.IMAP_HOST, port: M365_CONFIG.IMAP_PORT },
    stats:        { sent_24h: sent24h, received_24h: received24h, failed_24h: failed24h },
    lastPollTime: lastPoll,
    queuePending,
    queueFailed,
  };
}

// ─── Auto-seed M365 config into company_email_configs ────────────────────────
// Called once at server startup when M365_AUTO_SEED=true.
// Safe to call multiple times — it uses INSERT OR IGNORE / ON DUPLICATE KEY.

export async function seedM365Config() {
  const user  = process.env.M365_SMTP_USER || process.env.M365_IMAP_USER || 'support@technosprint.net';
  const pass  = process.env.M365_SMTP_PASS || '';
  const ipass = process.env.M365_IMAP_PASS || pass;
  const isDefault = process.env.M365_IS_DEFAULT === 'true' ? 1 : 0;

  if (!pass) {
    console.log('[M365] M365_SMTP_PASS not set — skipping auto-seed.');
    return;
  }

  try {
    // Check if already seeded
    const existing = await query(
      "SELECT id FROM company_email_configs WHERE email_address = ?",
      [user]
    );

    if (existing.length > 0) {
      // Update credentials & settings but don't change is_default if already set
      await execute(
        `UPDATE company_email_configs SET
          company_name   = ?,
          smtp_host      = ?,
          smtp_port      = ?,
          smtp_user      = ?,
          smtp_pass      = ?,
          imap_host      = ?,
          imap_port      = ?,
          imap_user      = ?,
          imap_pass      = ?,
          encryption     = ?,
          is_active      = 1,
          updated_at     = ?
        WHERE email_address = ?`,
        [
          M365_CONFIG.COMPANY_NAME,
          M365_CONFIG.SMTP_HOST, M365_CONFIG.SMTP_PORT, user, pass,
          M365_CONFIG.IMAP_HOST, M365_CONFIG.IMAP_PORT, user, ipass,
          'STARTTLS',
          formatDate(new Date()),
          user,
        ]
      );
      console.log('[M365] Existing config updated for support@technosprint.net');
      return;
    }

    // If setting as default, clear existing defaults first
    if (isDefault) {
      await execute("UPDATE company_email_configs SET is_default = 0");
    }

    await execute(
      `INSERT INTO company_email_configs
        (company_name, email_address,
         smtp_host, smtp_port, smtp_user, smtp_pass,
         imap_host, imap_port, imap_user, imap_pass,
         encryption, is_active, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        M365_CONFIG.COMPANY_NAME,
        user,
        M365_CONFIG.SMTP_HOST, M365_CONFIG.SMTP_PORT, user, pass,
        M365_CONFIG.IMAP_HOST, M365_CONFIG.IMAP_PORT, user, ipass,
        'STARTTLS',
        isDefault,
      ]
    );
    console.log('[M365] ✓ M365 config seeded for support@technosprint.net (default=' + isDefault + ')');

    await logM365Event({
      event_type: 'config_seeded', direction: 'outbound', status: 'success',
      sender: user, metadata: { smtp: M365_CONFIG.SMTP_HOST, imap: M365_CONFIG.IMAP_HOST },
    });
  } catch (e: any) {
    console.error('[M365] Seed failed:', e.message);
  }
}

// ─── Audit log query helpers ──────────────────────────────────────────────────

export async function getM365AuditLogs(params: {
  limit?:     number;
  direction?: string;
  status?:    string;
  event_type?: string;
}): Promise<any[]> {
  let sql    = `SELECT * FROM ${M365_AUDIT_TABLE} WHERE 1=1`;
  const vals: any[] = [];

  if (params.direction)  { sql += ' AND direction   = ?'; vals.push(params.direction);  }
  if (params.status)     { sql += ' AND status      = ?'; vals.push(params.status);     }
  if (params.event_type) { sql += ' AND event_type  = ?'; vals.push(params.event_type); }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  vals.push(params.limit ?? 100);

  try { return await query(sql, vals); } catch { return []; }
}
