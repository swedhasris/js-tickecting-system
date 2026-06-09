import { Router } from 'express';
import { query, execute, formatDate } from '../lib/db.js';
import { parseSlaDelayMeta, parseSlaDelayLogs } from '../lib/slaDelayUtils.js';
import { createTicket, updateTicket, getTicket, getDailyLeaderboard } from '../services/TicketService.js';
import { notifyTicketCreated, notifyStatusChanged, notifyAssigned } from '../services/NotificationService.js';

const router = Router();

// ── GET endpoints ─────────────────────────────────────────────────────────────

router.get('/tickets/all', async (_req, res) => {
  try {
    const tickets = await query('SELECT * FROM tickets ORDER BY created_at DESC');
    res.json(tickets.map((t: any) => ({ id: t.id.toString(), ...t })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tickets/open', async (_req, res) => {
  try {
    const tickets = await query("SELECT * FROM tickets WHERE status NOT IN ('Resolved','Closed','Canceled') ORDER BY created_at DESC");
    res.json(tickets.map((t: any) => ({ id: t.id.toString(), ...t })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tickets/resolved', async (_req, res) => {
  try {
    const tickets = await query("SELECT * FROM tickets WHERE status IN ('Resolved','Closed') ORDER BY resolved_at DESC");
    res.json(tickets.map((t: any) => ({ id: t.id.toString(), ...t })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tickets/unassigned', async (_req, res) => {
  try {
    const tickets = await query("SELECT * FROM tickets WHERE assigned_to IS NULL OR assigned_to = '' ORDER BY created_at DESC");
    res.json(tickets.map((t: any) => ({ id: t.id.toString(), ...t })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tickets/assigned/:userId', async (req, res) => {
  try {
    const tickets = await query('SELECT * FROM tickets WHERE assigned_to = ? ORDER BY created_at DESC', [req.params.userId]);
    res.json(tickets.map((t: any) => ({ id: t.id.toString(), ...t })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tickets/:id', async (req, res) => {
  try {
    const ticket = await getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Activities ────────────────────────────────────────────────────────────────

router.get('/tickets/:id/activities', async (req, res) => {
  try {
    const { visibility, activity_type, limit, offset } = req.query;
    let sql = 'SELECT * FROM ticket_activities WHERE ticket_id = ?';
    const params: any[] = [req.params.id];

    if (visibility === 'public')   sql += " AND visibility_type = 'public'";
    if (visibility === 'internal') sql += " AND visibility_type = 'internal'";
    if (activity_type) {
      const types = (activity_type as string).split(',');
      sql += ` AND activity_type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
    sql += ' ORDER BY created_at ASC';
    if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit as string) || 50); }
    if (offset) { sql += ' OFFSET ?'; params.push(parseInt(offset as string) || 0); }

    const activities = await query(sql, params);
    res.json(activities.map((a: any) => ({ id: a.id.toString(), ...a })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tickets/:id/activities', async (req, res) => {
  try {
    const { id } = req.params;
    const { activity_type, visibility_type, created_by, created_by_name, message, metadata_json } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const actType = activity_type || 'comment';
    const visType = visibility_type || (actType === 'work_note' ? 'internal' : 'public');

    const result = await execute(
      'INSERT INTO ticket_activities (ticket_id, activity_type, visibility_type, created_by, created_by_name, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, actType, visType, created_by || 'System', created_by_name || 'System',
       message.trim(), metadata_json ? JSON.stringify(metadata_json) : null]
    );

    if (['sla_rca', 'sla_follow_up'].includes(actType)) {
      await execute(
        'INSERT INTO sla_audit_logs (ticket_id, sla_type, event_type, reason, timestamp) VALUES (?, ?, ?, ?, ?)',
        [id, 'resolution', actType, message, formatDate(new Date())]
      ).catch(() => {});
    }

    await execute('UPDATE tickets SET updated_at = ? WHERE id = ?', [formatDate(new Date()), id]).catch(() => {});
    const [activity] = await query('SELECT * FROM ticket_activities WHERE id = ?', [result.insertId]);
    res.json({ id: result.insertId.toString(), ...activity });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tickets/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, user_name, message, is_internal } = req.body;
    const result = await execute(
      'INSERT INTO comments (ticket_id, user_id, user_name, message, is_internal) VALUES (?, ?, ?, ?, ?)',
      [id, user_id, user_name, message, is_internal ? 1 : 0]
    );
    await execute(
      'INSERT INTO ticket_activities (ticket_id, activity_type, visibility_type, created_by, created_by_name, message) VALUES (?, ?, ?, ?, ?, ?)',
      [id, is_internal ? 'work_note' : 'comment', is_internal ? 'internal' : 'public', user_id, user_name, message]
    );
    const [comment] = await query('SELECT * FROM comments WHERE id = ?', [result.insertId]);
    res.json({ id: result.insertId.toString(), ...comment });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/tickets/:id/custom-fields', async (req, res) => {
  try {
    const rows = await query('SELECT category_id, category_name, value_text FROM ticket_custom_fields WHERE ticket_id = ?', [req.params.id]);
    const cf: Record<string, string> = {};
    rows.forEach((r: any) => { cf[r.category_id.toString()] = r.value_text; });
    res.json(cf);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/tickets/:id/custom-fields', async (req, res) => {
  try {
    const { id } = req.params;
    const { customFields } = req.body;
    if (customFields) {
      await execute('DELETE FROM ticket_custom_fields WHERE ticket_id = ?', [id.toString()]);
      for (const [catId, valText] of Object.entries(customFields)) {
        if (valText) {
          const [cat] = await query('SELECT name FROM incident_categories WHERE id = ?', [catId]);
          await execute('INSERT INTO ticket_custom_fields (ticket_id, category_id, category_name, value_text) VALUES (?, ?, ?, ?)',
            [id.toString(), catId, cat?.name || `Field_${catId}`, valText]);
        }
      }
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post('/tickets/create', async (req, res) => {
  try {
    let hasAdminAccess = false;
    if (req.body.createdBy) {
      const [u] = await query('SELECT role FROM users WHERE uid = ?', [req.body.createdBy]);
      if (u && ['admin','super_admin','ultra_super_admin'].includes(u.role)) hasAdminAccess = true;
    }

    const createdTicket = await createTicket(req.body, hasAdminAccess);
    const ticketId      = createdTicket.id;

    // Notifications
    const agents = await query("SELECT uid FROM users WHERE role IN ('admin','agent','super_admin','ultra_super_admin')");
    await notifyTicketCreated(
      req.body.createdBy,
      req.body.assignedTo,
      createdTicket.ticket_number,
      createdTicket.assignment_group,
      req.body.createdByName || req.body.caller || 'System',
      agents.map((a: any) => a.uid)
    );

    res.json({ id: ticketId.toString(), ...createdTicket });
  } catch (e: any) {
    console.error('[Tickets] Create error:', e.message);
    res.status(500).json({ error: 'Failed to create ticket: ' + e.message });
  }
});

// ── Update ────────────────────────────────────────────────────────────────────

router.put('/tickets/:id', async (req, res) => {
  try {
    let hasAdminAccess = false;
    const uid = req.body.updatedById || req.body.createdBy;
    if (uid) {
      const [u] = await query('SELECT role FROM users WHERE uid = ?', [uid]);
      if (u && ['admin','super_admin','ultra_super_admin'].includes(u.role)) hasAdminAccess = true;
    }

    let result: any;
    try {
      result = await updateTicket(req.params.id, req.body, hasAdminAccess);
    } catch (e: any) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }

    const { ticket: updatedTicket, pointsAwarded, prevTicket } = result;

    // Status change notification
    if (req.body.status && req.body.status !== prevTicket.status && prevTicket.created_by) {
      await notifyStatusChanged(prevTicket.created_by, prevTicket.ticket_number, req.body.status);
    }

    // Assignment change notification
    if (req.body.assignedTo && req.body.assignedTo !== prevTicket.assigned_to) {
      await notifyAssigned(req.body.assignedTo, prevTicket.ticket_number);
    }

    let slaDelayMeta = {}, slaDelayLogs: any[] = [];
    try { slaDelayMeta = JSON.parse(updatedTicket?.sla_delay_meta_json || '{}'); } catch {}
    try { slaDelayLogs = JSON.parse(updatedTicket?.sla_delay_logs_json || '[]'); } catch {}

    res.json({
      id: req.params.id.toString(),
      ...updatedTicket,
      slaDelayMeta,
      slaDelayLogs,
      pointsAwarded,
    });
  } catch (e: any) {
    console.error('[Tickets] Update error:', e.message);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete('/tickets/all', async (_req, res) => {
  try {
    await execute('DELETE FROM tickets');
    res.json({ message: 'All tickets deleted' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/tickets/:id', async (req, res) => {
  try {
    await execute('DELETE FROM tickets WHERE id = ?', [req.params.id]);
    res.json({ message: 'Ticket deleted' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Misc ──────────────────────────────────────────────────────────────────────

router.post('/tickets/trigger-escalation', async (_req, res) => {
  const { escalateStaleTickets } = await import('../services/SLAService.js');
  await escalateStaleTickets();
  res.json({ message: 'Escalation check triggered' });
});

router.get('/leaderboard/daily', async (_req, res) => {
  try { res.json(await getDailyLeaderboard()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
