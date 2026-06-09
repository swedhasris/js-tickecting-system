import nodemailer from 'nodemailer';
import { query, execute, formatDate } from '../lib/db.js';

const RETRY_DELAYS = [60, 300, 900, 1800, 3600];

// ─── Get active SMTP config ────────────────────────────────────────────────────
async function getActiveConfig() {
  const rows = await query('SELECT * FROM company_email_configs WHERE is_active = 1 ORDER BY is_default DESC LIMIT 1');
  return rows[0] || null;
}

function buildTransporter(cfg: any) {
  return nodemailer.createTransport({
    host: cfg.smtp_host, port: cfg.smtp_port,
    secure: cfg.smtp_port === 465,
    auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1.2' },
  });
}

function envTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.technosprint.net',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: (process.env.SMTP_PORT || '465') === '465',
    auth: { user: process.env.SMTP_USER || 'Support@technosprint.net', pass: process.env.SMTP_PASS || '' },
    tls: { rejectUnauthorized: false },
  });
}

// ─── Log to email_logs ─────────────────────────────────────────────────────────
export async function logEmail(data: {
  ticket_id?: number; ticket_number?: string; direction: string;
  recipient?: string; sender?: string; subject?: string;
  message_id?: string; status: string; error_message?: string;
  email_type?: string; config_id?: number; sent_at?: string; received_at?: string;
}) {
  try {
    await execute(
      `INSERT INTO email_logs (ticket_id,ticket_number,direction,recipient,sender,subject,message_id,status,error_message,email_type,config_id,sent_at,received_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.ticket_id||null, data.ticket_number||null, data.direction,
       data.recipient||null, data.sender||null, data.subject||null,
       data.message_id||null, data.status, data.error_message||null,
       data.email_type||'notification', data.config_id||null,
       data.sent_at||null, data.received_at||null]
    );
  } catch { /* non-critical */ }
}

// ─── Enqueue email ─────────────────────────────────────────────────────────────
export async function enqueueEmail(
  eventType: string, ticketId: number|null, ticketNumber: string|null,
  recipient: string, subject: string, bodyHtml: string, configId?: number
) {
  await execute(
    'INSERT INTO notifications_queue (event_type,ticket_id,ticket_number,recipient,subject,body_html,config_id,status,priority) VALUES (?,?,?,?,?,?,?,\'pending\',3)',
    [eventType, ticketId, ticketNumber, recipient, subject, bodyHtml, configId||null]
  );
}

// ─── Process queue ─────────────────────────────────────────────────────────────
export async function processEmailQueue(): Promise<void> {
  const pending = await query(
    "SELECT * FROM notifications_queue WHERE status IN ('pending','retry') AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')) ORDER BY priority ASC, created_at ASC LIMIT 10"
  );
  if (!pending.length) return;
  console.log(`[EmailQueue] Processing ${pending.length} queued emails...`);

  for (const job of pending) {
    await execute("UPDATE notifications_queue SET status = 'processing' WHERE id = ?", [job.id]);
    try {
      const cfg    = await getActiveConfig();
      let transport: any;
      let fromAddr: string;

      if (!cfg) {
        transport = envTransporter();
        fromAddr  = `"Technosprint Support" <${process.env.SMTP_USER || 'Support@technosprint.net'}>`;
      } else {
        fromAddr  = `"${cfg.company_name} Support" <${cfg.email_address}>`;
        try {
          transport = buildTransporter(cfg);
          await transport.verify();
        } catch {
          transport = envTransporter();
          fromAddr  = `"Technosprint Support" <${process.env.SMTP_USER || 'Support@technosprint.net'}>`;
        }
      }

      const info = await transport.sendMail({
        from: fromAddr, to: job.recipient,
        subject: job.subject, html: job.body_html,
        headers: job.ticket_number ? { 'X-Ticket-Number': job.ticket_number } : {},
      });

      await execute("UPDATE notifications_queue SET status='sent', processed_at=datetime('now') WHERE id=?", [job.id]);
      await logEmail({
        ticket_id: job.ticket_id, ticket_number: job.ticket_number,
        direction: 'outbound', recipient: job.recipient,
        sender: cfg?.email_address, subject: job.subject,
        message_id: info.messageId, status: 'sent',
        email_type: job.event_type, config_id: cfg?.id,
        sent_at: new Date().toISOString(),
      });
      console.log(`[EmailQueue] ✓ Sent to ${job.recipient}`);
    } catch (err: any) {
      const retryCount = (job.retry_count || 0) + 1;
      const delay      = RETRY_DELAYS[Math.min(retryCount - 1, RETRY_DELAYS.length - 1)];
      if (retryCount >= (job.max_retries || 5)) {
        await execute("UPDATE notifications_queue SET status='failed', error_message=?, retry_count=? WHERE id=?",
          [err.message, retryCount, job.id]);
      } else {
        await execute("UPDATE notifications_queue SET status='retry', error_message=?, retry_count=?, next_retry_at=datetime('now','+' || ? || ' seconds') WHERE id=?",
          [err.message, retryCount, delay, job.id]);
      }
      console.error(`[EmailQueue] ✗ Failed for ${job.recipient}: ${err.message} (retry ${retryCount})`);
    }
  }
}

// ─── Direct send ───────────────────────────────────────────────────────────────
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const cfg = await getActiveConfig();
  const transport = cfg ? buildTransporter(cfg) : envTransporter();
  const from      = cfg ? `"${cfg.company_name} Support" <${cfg.email_address}>` : `"Technosprint Support" <${process.env.SMTP_USER}>`;
  await transport.sendMail({ from, to, subject, html });
}

// ─── Email health ──────────────────────────────────────────────────────────────
export async function getEmailHealth() {
  const configs    = await query('SELECT id, company_name, email_address, is_active FROM company_email_configs');
  const pending    = await query("SELECT COUNT(*) as cnt FROM notifications_queue WHERE status='pending'");
  const failed     = await query("SELECT COUNT(*) as cnt FROM notifications_queue WHERE status='failed'");
  const sent24h    = await query("SELECT COUNT(*) as cnt FROM email_logs WHERE direction='outbound' AND sent_at > datetime('now','-24 hours')");
  const recv24h    = await query("SELECT COUNT(*) as cnt FROM email_logs WHERE direction='inbound' AND received_at > datetime('now','-24 hours')");
  const lastPoll   = await query("SELECT MAX(received_at) as last FROM email_logs WHERE direction='inbound'");

  let smtpOk = false;
  const active = configs.find((c: any) => c.is_active);
  if (active) {
    try {
      const [full] = await query('SELECT * FROM company_email_configs WHERE id=?', [active.id]);
      const t = buildTransporter(full);
      await t.verify();
      smtpOk = true;
    } catch {}
  }

  return {
    status: smtpOk ? 'healthy' : 'degraded',
    smtp: { connected: smtpOk },
    queue: { pending: pending[0]?.cnt || 0, failed: failed[0]?.cnt || 0 },
    stats: { sent_24h: sent24h[0]?.cnt || 0, received_24h: recv24h[0]?.cnt || 0 },
    lastPollTime: lastPoll[0]?.last || null,
    configurations: configs.length,
  };
}
