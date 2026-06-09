import { Router } from 'express';
import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { query, execute } from '../lib/db.js';
import { getEmailHealth, processEmailQueue, logEmail, sendEmail } from '../services/EmailService.js';

const router = Router();

router.get('/email/health', async (_req, res) => {
  try { res.json(await getEmailHealth()); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/email/logs', async (req, res) => {
  try {
    const { ticket_id, direction, status, limit = '50' } = req.query as any;
    let sql = 'SELECT * FROM email_logs WHERE 1=1';
    const params: any[] = [];
    if (ticket_id) { sql += ' AND ticket_id = ?'; params.push(ticket_id); }
    if (direction) { sql += ' AND direction = ?'; params.push(direction); }
    if (status)    { sql += ' AND status = ?';    params.push(status); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    res.json(await query(sql, params));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/email/queue', async (_req, res) => {
  try {
    const items = await query('SELECT * FROM notifications_queue ORDER BY created_at DESC LIMIT 50');
    const stats = await query('SELECT status, COUNT(*) as count FROM notifications_queue GROUP BY status');
    res.json({ items, stats });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/email/queue/process', async (_req, res) => {
  try { await processEmailQueue(); res.json({ success: true }); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/email/queue/retry-failed', async (_req, res) => {
  try {
    await execute("UPDATE notifications_queue SET status='retry', retry_count=0, next_retry_at=NULL WHERE status='failed'");
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/email/send-test', async (req, res) => {
  try {
    const { to } = req.body;
    const [cfg] = await query('SELECT * FROM company_email_configs WHERE is_active=1 ORDER BY is_default DESC LIMIT 1');
    if (!cfg) return res.status(400).json({ error: 'No active email config' });
    const transport = nodemailer.createTransport({ host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_port===465, auth:{user:cfg.smtp_user,pass:cfg.smtp_pass}, tls:{rejectUnauthorized:false} });
    const recipient = to || cfg.email_address;
    await transport.sendMail({
      from: `"${cfg.company_name} Support" <${cfg.email_address}>`,
      to: recipient,
      subject: `[TEST] Ticklora Email Test — ${new Date().toLocaleString()}`,
      html: `<p>✅ Email integration working!</p><p>SMTP: ${cfg.smtp_host}:${cfg.smtp_port}</p><p>Time: ${new Date().toISOString()}</p>`,
    });
    await logEmail({ direction:'outbound', recipient, sender:cfg.email_address, subject:'Test Email', status:'sent', email_type:'test', config_id:cfg.id, sent_at:new Date().toISOString() });
    res.json({ success: true, message: `Test email sent to ${recipient}` });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/email/send-note', async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    await sendEmail(to, subject, body);
    res.json({ message: 'Email sent' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/email/threads/:ticketNumber', async (req, res) => {
  try {
    const threads = await query('SELECT * FROM email_threads WHERE ticket_number = ?', [req.params.ticketNumber]);
    const logs    = await query('SELECT * FROM email_logs WHERE ticket_number = ? ORDER BY created_at DESC', [req.params.ticketNumber]);
    res.json({ threads, logs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Email Configs ─────────────────────────────────────────────────────────────

router.get('/email-configs', async (_req, res) => {
  try { res.json(await query('SELECT * FROM company_email_configs ORDER BY created_at DESC')); } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/email-configs', async (req, res) => {
  try {
    const data = req.body;
    const fields = Object.keys(data);
    if (data.is_default) await execute('UPDATE company_email_configs SET is_default=0');
    const result = await execute(
      `INSERT INTO company_email_configs (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,
      fields.map(k => data[k])
    );
    res.json({ id: result.insertId, ...data });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/email-configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at');
    if (data.is_default) await execute('UPDATE company_email_configs SET is_default=0 WHERE id != ?', [id]);
    await execute(`UPDATE company_email_configs SET ${fields.map(k=>`${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [...fields.map(k=>data[k]), id]);
    res.json({ id, ...data });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/email-configs/:id', async (req, res) => {
  try { await execute('DELETE FROM company_email_configs WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/email-configs/test', async (req, res) => {
  try {
    const cfg = req.body;
    const t = nodemailer.createTransport({ host:cfg.smtp_host, port:cfg.smtp_port, secure:cfg.smtp_port===465, auth:{user:cfg.smtp_user,pass:cfg.smtp_pass}, tls:{rejectUnauthorized:false} });
    await t.verify();
    const conn = await imaps.connect({ imap:{ user:cfg.imap_user, password:cfg.imap_pass, host:cfg.imap_host, port:cfg.imap_port, tls:true, tlsOptions:{rejectUnauthorized:false}, authTimeout:10000 }});
    conn.end();
    res.json({ success: true, message: 'SMTP and IMAP connections successful!' });
  } catch (e: any) { res.status(500).json({ error: 'Connection failed', detail: e.message }); }
});

export default router;
