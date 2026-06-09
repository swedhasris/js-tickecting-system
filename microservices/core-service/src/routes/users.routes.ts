import { Router } from 'express';
import { query, execute, formatDate } from '../lib/db.js';
import { simpleHash } from '../middleware/auth.js';

const router = Router();

router.get('/users', async (_req, res) => {
  try {
    const users = await query('SELECT id, uid, name, email, role, phone, is_active, created_at FROM users ORDER BY name');
    res.json(users.map((u: any) => ({ id: u.id.toString(), ...u })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/users/:uid', async (req, res) => {
  try {
    const [user] = await query('SELECT id, uid, name, email, role, phone, is_active, created_at FROM users WHERE uid = ?', [req.params.uid]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id.toString(), ...user });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/users', async (req, res) => {
  try {
    const { uid, name, email, role, phone, password_hash, password } = req.body;
    const hash = password_hash || (password ? simpleHash(password) : null);
    const result = await execute(
      'INSERT INTO users (uid, name, email, role, phone, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [uid, name, email, role || 'user', phone, hash]
    );
    const [created] = await query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId.toString(), ...created });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/users/:uid', async (req, res) => {
  try {
    const { name, email, role, phone, is_active, password, password_hash } = req.body;
    const hash = password_hash || (password ? simpleHash(password) : undefined);
    const fields: string[] = [];
    const values: any[] = [];

    if (name   !== undefined) { fields.push('name = ?');      values.push(name); }
    if (email  !== undefined) { fields.push('email = ?');     values.push(email); }
    if (role   !== undefined) { fields.push('role = ?');      values.push(role); }
    if (phone  !== undefined) { fields.push('phone = ?');     values.push(phone); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active); }
    if (hash   !== undefined) { fields.push('password_hash = ?'); values.push(hash); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.params.uid);
    await execute(`UPDATE users SET ${fields.join(', ')} WHERE uid = ?`, values);
    const [updated] = await query('SELECT * FROM users WHERE uid = ?', [req.params.uid]);
    res.json({ id: updated.id.toString(), ...updated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:uid', async (req, res) => {
  try {
    await execute('UPDATE users SET is_active = 0 WHERE uid = ?', [req.params.uid]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
