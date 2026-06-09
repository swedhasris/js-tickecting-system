import { Router } from 'express';
import { query, execute } from '../lib/db.js';

const router = Router();

router.get('/notifications', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const rows = await query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [user_id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/notifications/unread-count', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const [row] = await query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [user_id]);
    res.json({ count: row?.count || 0 });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/notifications/mark-read', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [user_id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
