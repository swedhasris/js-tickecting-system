import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// DB
import mysql from 'mysql2/promise';
loadEnv();

const cfg = { host:process.env.MYSQL_HOST||'localhost', port:parseInt(process.env.MYSQL_PORT||'3306'), user:process.env.MYSQL_USER||'root', password:process.env.MYSQL_PASSWORD||'', database:process.env.MYSQL_DATABASE||'connectit_db', waitForConnections:true, connectionLimit:10, queueLimit:0 };
let pool: mysql.Pool | null = null;
let sqliteDb: any = null;
let useSQLite = false;

async function getSQLite() {
  if (!sqliteDb) {
    try {
      const { open } = await import('sqlite');
      const sqlite3 = (await import('sqlite3')).default;
      sqliteDb = await open({ filename:'./timesheet.sqlite', driver:sqlite3.Database });
    } catch {
      console.warn('[ActivityDB] sqlite3 unavailable — SQLite disabled. Ensure MySQL is running.');
      sqliteDb = { all: async () => [], run: async () => ({ lastID:0, changes:0 }), exec: async () => {} };
    }
  }
  return sqliteDb;
}

async function q(sql: string, vals?: any[]): Promise<any[]> {
  if (useSQLite) { const db = await getSQLite(); return db.all(sql, vals||[]); }
  try { if (!pool) pool = mysql.createPool(cfg); const [r] = await pool.execute(sql, vals); return r as any[]; }
  catch (e: any) { console.error('[ActivityDB]', e.message); throw e; }
}
async function ex(sql: string, vals?: any[]): Promise<any> {
  if (useSQLite) { const db = await getSQLite(); const r = await db.run(sql, vals||[]); return { insertId:r.lastID, affectedRows:r.changes }; }
  try { if (!pool) pool = mysql.createPool(cfg); const [r] = await pool.execute(sql, vals); return r; }
  catch (e: any) { console.error('[ActivityDB exec]', e.message); throw e; }
}
function fmt(d: Date|null): string|null {
  if (!d) return null;
  return d.toISOString().slice(0,19).replace('T',' ');
}

const app  = express();
const PORT = parseInt(process.env.ACTIVITY_PORT || '3003');
const __dirname = dirname(fileURLToPath(import.meta.url));

app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors({ origin:'*', methods:['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json({ limit:'15mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ service:'activity', status:'ok' }));

// ── Screenshot Upload ─────────────────────────────────────────────────────────
const uploadsDir = join(__dirname,'..','..','..','tis','public','uploads','screenshots');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive:true });

const screenshotStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')),
});
const upload = multer({ storage:screenshotStorage, limits:{ fileSize:15*1024*1024 }, fileFilter:(_req,file,cb) => {
  if (['image/png','image/jpeg','image/jpg'].includes(file.mimetype)) cb(null,true);
  else cb(new Error('Only PNG/JPEG accepted'));
}});

app.post('/api/upload-screenshot', upload.single('screenshot'), (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error:'No file received' });
  const fmt_ = req.file.mimetype === 'image/png' ? 'PNG' : 'JPEG';
  res.json({ image_url:`/uploads/screenshots/${req.file.filename}`, filename:req.file.filename, format:fmt_, size_kb:Math.round(req.file.size/1024) });
});

// ── Activity Sessions ────────────────────────────────────────────────────────

app.post('/api/activity-sessions', async (req, res) => {
  try {
    const { session_id, user_id, user_name, start_time, status, ticket_number } = req.body;
    if (!user_id || !session_id) return res.status(400).json({ error:'Missing user_id or session_id' });
    const r = await ex('INSERT INTO activity_sessions (session_id,user_id,user_name,start_time,status,ticket_number) VALUES (?,?,?,?,?,?)',
      [session_id, user_id, user_name||null, start_time||new Date().toISOString(), status||'active', ticket_number||null]);
    const [row] = await q('SELECT * FROM activity_sessions WHERE id=?', [r.insertId]);
    res.json({ id:r.insertId.toString(), ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.put('/api/activity-sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k=>k!=='id');
    if (!fields.length) return res.json({ message:'Nothing to update' });
    await ex(`UPDATE activity_sessions SET ${fields.map(k=>`${k}=?`).join(', ')} WHERE id=?`, [...fields.map(k=>req.body[k]), id]);
    const [row] = await q('SELECT * FROM activity_sessions WHERE id=?', [id]);
    res.json({ id, ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.get('/api/activity-sessions', async (req, res) => {
  try {
    const { user_id, status:s, limit='20' } = req.query as any;
    let sql = 'SELECT * FROM activity_sessions WHERE 1=1';
    const vals: any[] = [];
    if (user_id) { sql+=' AND user_id=?'; vals.push(user_id); }
    if (s)       { sql+=' AND status=?';  vals.push(s); }
    sql+=` ORDER BY created_at DESC LIMIT ?`; vals.push(parseInt(limit)||20);
    const rows = await q(sql, vals);
    res.json(rows.map((r:any)=>({ id:r.id?.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

// ── Activity Entries ──────────────────────────────────────────────────────────

app.post('/api/activity-entries', async (req, res) => {
  try {
    const { session_id, user_id, screenshot_url, screenshot_filename, screenshot_format, screenshot_size_kb, activity_label, description, confidence, captured_at, keystrokes, clicks, ticket_number } = req.body;
    if (!user_id) return res.status(400).json({ error:'Missing user_id' });
    const r = await ex(
      'INSERT INTO activity_entries (session_id,user_id,screenshot_url,screenshot_filename,screenshot_format,screenshot_size_kb,activity_label,description,confidence,captured_at,keystrokes,clicks,ticket_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [session_id||null, user_id, screenshot_url||null, screenshot_filename||null, screenshot_format||null, screenshot_size_kb||null, activity_label||null, description||null, confidence||0, captured_at||null, keystrokes||0, clicks||0, ticket_number||null]
    );
    const [row] = await q('SELECT * FROM activity_entries WHERE id=?', [r.insertId]);
    res.json({ id:r.insertId.toString(), ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.get('/api/activity-entries', async (req, res) => {
  try {
    const { user_id, session_id, start_date, end_date, limit='100' } = req.query as any;
    let sql = 'SELECT * FROM activity_entries WHERE 1=1';
    const vals: any[] = [];
    if (user_id)    { sql+=' AND user_id=?';     vals.push(user_id); }
    if (session_id) { sql+=' AND session_id=?';  vals.push(session_id); }
    if (start_date) { sql+=' AND captured_at>=?'; vals.push(start_date); }
    if (end_date)   { sql+=' AND captured_at<=?'; vals.push(end_date); }
    sql+=` ORDER BY captured_at ASC LIMIT ?`; vals.push(parseInt(limit)||100);
    const rows = await q(sql, vals);
    res.json(rows.map((r:any)=>({ id:r.id?.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.put('/api/activity-entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k=>k!=='id'&&k!=='created_at');
    if (!fields.length) return res.json({ message:'Nothing to update' });
    await ex(`UPDATE activity_entries SET ${fields.map(k=>`${k}=?`).join(', ')} WHERE id=?`, [...fields.map(k=>req.body[k]), id]);
    const [row] = await q('SELECT * FROM activity_entries WHERE id=?', [id]);
    res.json({ id, ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

// ── Work Sessions ─────────────────────────────────────────────────────────────

app.post('/api/work-sessions', async (req, res) => {
  try {
    const { user_id, user_name, ticket_id, ticket_number, start_time, stop_time, duration, start_context, stop_context, ai_notes_start, ai_notes_stop, status } = req.body;
    const r = await ex('INSERT INTO work_sessions (user_id,user_name,ticket_id,ticket_number,start_time,stop_time,duration,start_context,stop_context,ai_notes_start,ai_notes_stop,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [user_id, user_name, ticket_id, ticket_number, start_time, stop_time||null, duration||0, start_context||null, stop_context||null, ai_notes_start||null, ai_notes_stop||null, status||'active']);
    const [row] = await q('SELECT * FROM work_sessions WHERE id=?', [r.insertId]);
    res.json({ id:r.insertId.toString(), ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.put('/api/work-sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = Object.keys(req.body).filter(k=>k!=='id');
    await ex(`UPDATE work_sessions SET ${fields.map(k=>`${k}=?`).join(', ')} WHERE id=?`, [...fields.map(k=>req.body[k]), id]);
    const [row] = await q('SELECT * FROM work_sessions WHERE id=?', [id]);
    res.json({ id, ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.get('/api/work-sessions', async (req, res) => {
  try {
    const { user_id, ticket_id, status:s } = req.query as any;
    let sql = 'SELECT * FROM work_sessions WHERE 1=1';
    const vals: any[] = [];
    if (user_id)  { sql+=' AND user_id=?';  vals.push(user_id); }
    if (ticket_id){ sql+=' AND ticket_id=?'; vals.push(ticket_id); }
    if (s)        { sql+=' AND status=?';    vals.push(s); }
    sql+=' ORDER BY created_at DESC';
    const rows = await q(sql, vals);
    res.json(rows.map((r:any)=>({ id:r.id?.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

// ── Work Notes ────────────────────────────────────────────────────────────────

app.post('/api/work-notes', async (req, res) => {
  try {
    const { user_id, user_name, ticket_id, ticket_number, session_id, note_type, screenshot_url, screenshot_filename, screenshot_format, screenshot_size_kb, ai_note, duration_seconds, duration_display } = req.body;
    if (!user_id || !note_type) return res.status(400).json({ error:'user_id and note_type required' });
    const r = await ex('INSERT INTO work_notes (user_id,user_name,ticket_id,ticket_number,session_id,note_type,screenshot_url,screenshot_filename,screenshot_format,screenshot_size_kb,ai_note,duration_seconds,duration_display) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [user_id, user_name||null, ticket_id||null, ticket_number||null, session_id||null, note_type, screenshot_url||null, screenshot_filename||null, screenshot_format||null, screenshot_size_kb||null, ai_note||null, duration_seconds||null, duration_display||null]);
    const [row] = await q('SELECT * FROM work_notes WHERE id=?', [r.insertId]);
    res.json({ id:r.insertId.toString(), ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.get('/api/work-notes', async (req, res) => {
  try {
    const { user_id, ticket_id, session_id, limit='50' } = req.query as any;
    let sql = 'SELECT * FROM work_notes WHERE 1=1';
    const vals: any[] = [];
    if (user_id)    { sql+=' AND user_id=?';    vals.push(user_id); }
    if (ticket_id)  { sql+=' AND ticket_id=?';  vals.push(ticket_id); }
    if (session_id) { sql+=' AND session_id=?'; vals.push(session_id); }
    sql+=` ORDER BY created_at DESC LIMIT ?`; vals.push(parseInt(limit)||50);
    const rows = await q(sql, vals);
    res.json(rows.reverse().map((r:any)=>({ id:r.id?.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

// ── Message History ───────────────────────────────────────────────────────────

app.post('/api/message-history', async (req, res) => {
  try {
    const { user_id, user_name, message_type, recipient, message_content } = req.body;
    if (!user_id || !message_type) return res.status(400).json({ error:'user_id and message_type required' });
    const r = await ex('INSERT INTO message_history (user_id,user_name,message_type,recipient,message_content) VALUES (?,?,?,?,?)',
      [user_id, user_name||null, message_type, recipient||null, message_content||null]);
    const [row] = await q('SELECT * FROM message_history WHERE id=?', [r.insertId]);
    res.json({ id:r.insertId.toString(), ...row });
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

app.get('/api/message-history', async (req, res) => {
  try {
    const { user_id, message_type, limit='100' } = req.query as any;
    let sql = 'SELECT * FROM message_history WHERE 1=1';
    const vals: any[] = [];
    if (user_id)     { sql+=' AND user_id=?';     vals.push(user_id); }
    if (message_type){ sql+=' AND message_type=?'; vals.push(message_type); }
    sql+=` ORDER BY sent_at DESC LIMIT ?`; vals.push(parseInt(limit)||100);
    const rows = await q(sql, vals);
    res.json(rows.map((r:any)=>({ id:r.id?.toString(), ...r })));
  } catch (e: any) { res.status(500).json({ error:e.message }); }
});

// ── Input stats (stub — real tracking is Electron-only) ───────────────────────
app.get('/api/input-stats', (_req, res) => res.json({ keystrokes:0, clicks:0, note:'Input tracking is available in Electron desktop mode only' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📊 Activity Service running on http://localhost:${PORT}`);
  console.log('[Activity] Sessions | Entries | Work Notes | Screenshots');
});
