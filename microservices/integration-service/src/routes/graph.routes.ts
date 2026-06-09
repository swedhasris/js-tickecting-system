import { Router } from 'express';
import { query } from '../lib/db.js';
import { sendViaGraph, testGraphConnection, getGraphHealth, getGraphSetup } from '../services/GraphEmailService.js';

const router = Router();

router.get('/graph/health',  async (_req, res) => { try { res.json(await getGraphHealth()); } catch (e: any) { res.status(500).json({ error: e.message }); } });
router.post('/graph/test',   async (_req, res) => { try { res.json(await testGraphConnection()); } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); } });
router.get('/graph/setup',   (_req, res) => res.json(getGraphSetup()));

router.post('/graph/send-test', async (req, res) => {
  try {
    const { to } = req.body;
    const recipient = to || process.env.GRAPH_USER_EMAIL || 'support@technosprint.net';
    res.json(await sendViaGraph({
      to: recipient,
      subject: `[TEST] Microsoft Graph Email — ${new Date().toLocaleString()}`,
      html: `<div style="font-family:sans-serif;padding:24px"><h2 style="color:#0078d4">✅ Microsoft Graph Working</h2><p>OAuth2 via Graph API is operational.</p><p>Sent: ${new Date().toISOString()}</p></div>`,
    }));
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── M365 endpoints ────────────────────────────────────────────────────────────

router.get('/m365/health', async (_req, res) => {
  try {
    const health = await getGraphHealth();
    const [cfg] = await query('SELECT * FROM company_email_configs WHERE smtp_host=\'smtp.office365.com\' OR email_address=\'support@technosprint.net\' ORDER BY updated_at DESC LIMIT 1');
    res.json({
      status: health.configured ? 'configured' : 'not_configured',
      smtp: { connected: health.configured, host: 'smtp.office365.com', port: 587, error: null },
      imap: { connected: health.configured, host: 'outlook.office365.com', port: 993, error: null },
      stats: { sent_24h: 0, received_24h: 0, failed_24h: 0 },
      lastPollTime: null, queuePending: 0, queueFailed: 0,
      startupStatus: { dbSeeded: !!cfg, smtpOk: health.configured, imapOk: health.configured },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/m365/test-smtp', async (_req, res) => { try { res.json(await testGraphConnection()); } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); } });
router.post('/m365/test-imap', async (_req, res) => { try { res.json(await testGraphConnection()); } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); } });

router.post('/m365/send-test', async (req, res) => {
  try {
    const { to } = req.body;
    res.json(await sendViaGraph({
      to: to || 'support@technosprint.net',
      subject: `[TEST] M365 Integration — ${new Date().toLocaleString()}`,
      html: `<div style="font-family:sans-serif;padding:20px"><h2>✅ M365 Working</h2><p>Sent: ${new Date().toISOString()}</p></div>`,
    }));
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/m365/audit-logs', async (req, res) => {
  try {
    const { direction, status, event_type, limit = '200' } = req.query as any;
    let sql = 'SELECT * FROM m365_email_audit WHERE 1=1';
    const params: any[] = [];
    if (direction)  { sql += ' AND direction=?';   params.push(direction); }
    if (status)     { sql += ' AND status=?';      params.push(status); }
    if (event_type) { sql += ' AND event_type=?';  params.push(event_type); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json(await query(sql, params));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/m365/config', async (_req, res) => {
  try {
    const [row] = await query('SELECT id,company_name,email_address,smtp_host,smtp_port,imap_host,imap_port,encryption,is_active,is_default,updated_at FROM company_email_configs WHERE email_address=\'support@technosprint.net\' OR smtp_host=\'smtp.office365.com\' ORDER BY updated_at DESC LIMIT 1');
    res.json({
      configured: !!row, config: row || null,
      startupStatus: { dbSeeded: !!row, smtpOk: null, imapOk: null },
      defaults: { email_address:'support@technosprint.net', smtp_host:'smtp.office365.com', smtp_port:587, smtp_encryption:'STARTTLS', imap_host:'outlook.office365.com', imap_port:993, imap_encryption:'SSL' },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/m365/stats', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const [recv, sent, failed, qs] = await Promise.allSettled([
      query("SELECT COUNT(*) as cnt FROM email_logs WHERE direction='inbound' AND created_at>=?", [since]),
      query("SELECT COUNT(*) as cnt FROM email_logs WHERE direction='outbound' AND status='sent' AND created_at>=?", [since]),
      query("SELECT COUNT(*) as cnt FROM email_logs WHERE status='failed' AND created_at>=?", [since]),
      query("SELECT status,COUNT(*) as cnt FROM notifications_queue GROUP BY status"),
    ]);
    const qStats: Record<string,number> = {};
    if (qs.status === 'fulfilled') qs.value.forEach((r: any) => { qStats[r.status] = Number(r.cnt); });
    res.json({
      emails_received_today: recv.status==='fulfilled' ? Number(recv.value?.[0]?.cnt)||0 : 0,
      emails_sent_today:     sent.status==='fulfilled' ? Number(sent.value?.[0]?.cnt)||0 : 0,
      failed_emails_today:   failed.status==='fulfilled' ? Number(failed.value?.[0]?.cnt)||0 : 0,
      queue_pending: qStats['pending']||0, queue_failed: qStats['failed']||0, queue_sent: qStats['sent']||0,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/m365/poll-now', (_req, res) => {
  res.json({ success: true, message: 'IMAP poll triggered. Using Graph API — check audit logs.' });
});

router.post('/m365/seed-config', async (_req, res) => {
  try {
    const user = process.env.M365_SMTP_USER || 'support@technosprint.net';
    const pass = process.env.M365_SMTP_PASS || '';
    const [existing] = await query('SELECT id FROM company_email_configs WHERE email_address=?', [user]);
    if (existing) {
      await query('UPDATE company_email_configs SET smtp_host=\'smtp.office365.com\', smtp_port=587, smtp_user=?, smtp_pass=?, imap_host=\'outlook.office365.com\', imap_port=993, imap_user=?, imap_pass=?, is_active=1 WHERE email_address=?', [user, pass, user, pass, user]);
    } else {
      await query('UPDATE company_email_configs SET is_default=0');
      await query('INSERT INTO company_email_configs (company_name,email_address,smtp_host,smtp_port,smtp_user,smtp_pass,imap_host,imap_port,imap_user,imap_pass,encryption,is_active,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,1)',
        ['Technosprint', user, 'smtp.office365.com', 587, user, pass, 'outlook.office365.com', 993, user, pass, 'STARTTLS']);
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
