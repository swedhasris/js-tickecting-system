import { Router } from 'express';
import { query, execute, formatDate } from '../lib/db.js';

const router = Router();

// ── Timesheets ────────────────────────────────────────────────────────────────

router.get('/timesheets', async (req, res) => {
  try {
    const { user_id, week_start, status } = req.query;
    let sql = 'SELECT * FROM timesheets WHERE 1=1';
    const vals: any[] = [];
    if (user_id)    { sql += ' AND user_id = ?';    vals.push(user_id); }
    if (week_start) { sql += ' AND week_start = ?'; vals.push(week_start); }
    if (status)     { sql += ' AND status = ?';     vals.push(status); }
    const rows = await query(sql, vals);
    res.json(rows.map((r: any) => ({ id: r.id.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/timesheets/all', async (_req, res) => {
  try {
    const rows = await query('SELECT * FROM timesheets ORDER BY updated_at DESC');
    res.json(rows.map((r: any) => ({ id: r.id.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/timesheets/get-or-create', async (req, res) => {
  try {
    const { user_id, week_start, week_end } = req.body;
    const existing = await query('SELECT * FROM timesheets WHERE user_id = ? AND week_start = ?', [user_id, week_start]);
    if (existing.length) return res.json({ id: existing[0].id.toString(), ...existing[0] });

    const result = await execute(
      "INSERT INTO timesheets (user_id, week_start, week_end, status) VALUES (?, ?, ?, 'Draft')",
      [user_id, week_start, week_end]
    );
    const [created] = await query('SELECT * FROM timesheets WHERE id = ?', [result.insertId]);
    res.json({ id: result.insertId.toString(), ...created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/timesheets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body.status === 'Approved' && !req.body.approved_at) {
      req.body.approved_at = formatDate(new Date());
    }
    const fields = Object.keys(req.body).filter(k => k !== 'id');
    const setClause = fields.map(k => `${k} = ?`).join(', ');
    const values = [...fields.map(k => req.body[k])];

    if (req.body.status === 'Submitted') {
      await execute(`UPDATE timesheets SET ${setClause}, submitted_at = ? WHERE id = ?`,
        [...values, formatDate(new Date()), id]);
    } else {
      await execute(`UPDATE timesheets SET ${setClause} WHERE id = ?`, [...values, id]);
    }
    if (req.body.status) {
      await execute('UPDATE time_cards SET status = ? WHERE timesheet_id = ?', [req.body.status, id]);
    }
    const [updated] = await query('SELECT * FROM timesheets WHERE id = ?', [id]);
    res.json({ id: id.toString(), ...updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/timesheets/:id', async (req, res) => {
  try {
    await execute('DELETE FROM time_cards WHERE timesheet_id = ?', [req.params.id]);
    await execute('DELETE FROM timesheets WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Time Cards ────────────────────────────────────────────────────────────────

router.get('/time-cards', async (req, res) => {
  try {
    const { timesheet_id, user_id, start_date, end_date } = req.query;
    let sql = 'SELECT * FROM time_cards WHERE 1=1';
    const vals: any[] = [];
    if (timesheet_id) { sql += ' AND timesheet_id = ?'; vals.push(timesheet_id); }
    if (user_id)      { sql += ' AND user_id = ?';      vals.push(user_id); }
    if (start_date && end_date) { sql += ' AND entry_date BETWEEN ? AND ?'; vals.push(start_date, end_date); }
    const rows = await query(sql, vals);
    res.json(rows.map((r: any) => ({ id: r.id.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/time-cards', async (req, res) => {
  try {
    const fields = Object.keys(req.body);
    const result = await execute(
      `INSERT INTO time_cards (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map(k => req.body[k])
    );
    const [created] = await query('SELECT * FROM time_cards WHERE id = ?', [result.insertId]);
    if (req.body.timesheet_id) {
      const [tot] = await query('SELECT SUM(hours_worked) as total FROM time_cards WHERE timesheet_id = ?', [req.body.timesheet_id]);
      await execute('UPDATE timesheets SET total_hours = ? WHERE id = ?', [tot?.total || 0, req.body.timesheet_id]);
    }
    res.json({ id: result.insertId.toString(), ...created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/time-cards/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k => k !== 'id');
    await execute(`UPDATE time_cards SET ${fields.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map(k => req.body[k]), id]);
    const [updated] = await query('SELECT * FROM time_cards WHERE id = ?', [id]);
    if (updated?.timesheet_id) {
      const [tot] = await query('SELECT SUM(hours_worked) as total FROM time_cards WHERE timesheet_id = ?', [updated.timesheet_id]);
      await execute('UPDATE timesheets SET total_hours = ? WHERE id = ?', [tot?.total || 0, updated.timesheet_id]);
    }
    res.json({ id: id.toString(), ...updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/time-cards/:id', async (req, res) => {
  try {
    const [card] = await query('SELECT timesheet_id FROM time_cards WHERE id = ?', [req.params.id]);
    await execute('DELETE FROM time_cards WHERE id = ?', [req.params.id]);
    if (card?.timesheet_id) {
      const [tot] = await query('SELECT SUM(hours_worked) as total FROM time_cards WHERE timesheet_id = ?', [card.timesheet_id]);
      await execute('UPDATE timesheets SET total_hours = ? WHERE id = ?', [tot?.total || 0, card.timesheet_id]);
    }
    res.json({ message: 'Time card deleted' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
