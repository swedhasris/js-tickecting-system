/** Shared DB access for integration service — MySQL primary, SQLite safe fallback */
import mysql from 'mysql2/promise';
import { config as loadEnv } from 'dotenv';
loadEnv();

const cfg = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'connectit_db',
  waitForConnections: true, connectionLimit: 10, queueLimit: 0,
};

let pool: mysql.Pool | null = null;
let useSQLite = false;
let sqliteDb: any = null;

// In-memory stub when sqlite3 binary is unavailable
const noopDb = {
  all:  async () => [] as any[],
  run:  async () => ({ lastID: 0, changes: 0 }),
  exec: async () => {},
};

export function setUseSQLite(v: boolean) { useSQLite = v; }

function getPool() {
  if (!pool) pool = mysql.createPool(cfg);
  return pool;
}

async function getSQLite() {
  if (!sqliteDb) {
    try {
      const { open } = await import('sqlite');
      const sqlite3 = (await import('sqlite3')).default;
      sqliteDb = await open({ filename: './timesheet.sqlite', driver: sqlite3.Database });
    } catch {
      console.warn('[IntegDB] sqlite3 native binding unavailable — SQLite disabled. Use MySQL.');
      sqliteDb = noopDb;
    }
  }
  return sqliteDb;
}

export async function query(sql: string, values?: any[]): Promise<any[]> {
  if (useSQLite) { const db = await getSQLite(); return db.all(sql, values || []); }
  try {
    const [r] = await getPool().execute(sql, values);
    return r as any[];
  } catch (e: any) {
    console.error('[IntegDB query]', e.message);
    throw e;
  }
}

export async function execute(sql: string, values?: any[]): Promise<any> {
  if (useSQLite) { const db = await getSQLite(); const r = await db.run(sql, values || []); return { insertId: r.lastID, affectedRows: r.changes }; }
  try {
    const [r] = await getPool().execute(sql, values);
    return r;
  } catch (e: any) {
    console.error('[IntegDB execute]', e.message);
    throw e;
  }
}

export function formatDate(d: Date | string | null): string | null {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}
