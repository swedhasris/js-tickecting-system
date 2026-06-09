import mysql from 'mysql2/promise';
import { config as loadEnv } from 'dotenv';

loadEnv();

const dbConfig = {
  host:               process.env.MYSQL_HOST     || 'localhost',
  port:               parseInt(process.env.MYSQL_PORT || '3306'),
  user:               process.env.MYSQL_USER     || 'root',
  password:           process.env.MYSQL_PASSWORD || '',
  database:           process.env.MYSQL_DATABASE || 'connectit_db',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
  timezone:           'Z',
};

let pool: mysql.Pool | null = null;
let useSQLite = false;
let sqliteDb: any = null;

export function setUseSQLite(v: boolean) { useSQLite = v; }

export function getPool(): mysql.Pool {
  if (!pool) pool = mysql.createPool(dbConfig);
  return pool;
}

async function getSQLite(filepath?: string) {
  if (!sqliteDb) {
    const filename = filepath || process.env.SQLITE_PATH || './timesheet.sqlite';
    try {
      const { open } = await import('sqlite');
      const sqlite3 = (await import('sqlite3')).default;
      sqliteDb = await open({ filename, driver: sqlite3.Database });
      console.log(`[DB] SQLite opened: ${filename}`);
    } catch {
      console.warn('[DB] sqlite3 native binding unavailable — SQLite disabled. Ensure MySQL is running.');
      sqliteDb = {
        all: async () => [],
        run: async () => ({ lastID: 0, changes: 0 }),
        exec: async () => {},
      };
    }
  }
  return sqliteDb;
}

export async function query(sql: string, values?: any[]): Promise<any[]> {
  if (useSQLite) {
    const db = await getSQLite();
    return db.all(sql, values || []);
  }
  try {
    const [rows] = await getPool().execute(sql, values);
    return rows as any[];
  } catch (e: any) {
    console.error('[DB query]', e.message);
    throw e;
  }
}

export async function execute(sql: string, values?: any[]): Promise<any> {
  if (useSQLite) {
    const db = await getSQLite();
    const r = await db.run(sql, values || []);
    return { insertId: r.lastID, affectedRows: r.changes };
  }
  try {
    const [result] = await getPool().execute(sql, values);
    return result as mysql.ResultSetHeader;
  } catch (e: any) {
    console.error('[DB execute]', e.message);
    throw e;
  }
}

export function formatDate(date: Date | string | null): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function initDB(): Promise<void> {
  // If USE_SQLITE=true in env, skip MySQL and go straight to SQLite
  if (process.env.USE_SQLITE === 'true') {
    useSQLite = true;
    setUseSQLite(true);
    const sqlitePath = process.env.SQLITE_PATH || './timesheet.sqlite';
    console.log(`[DB] Using SQLite: ${sqlitePath}`);
    await getSQLite(sqlitePath);
    return;
  }
  try {
    const tmp = { ...dbConfig } as any;
    delete tmp.database;
    const conn = await mysql.createConnection(tmp);
    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
    console.log(`[DB] Database '${dbConfig.database}' ready`);
  } catch (e: any) {
    console.warn('[DB] MySQL init failed — using SQLite fallback:', e.message);
    useSQLite = true;
    setUseSQLite(true);
    await getSQLite();
  }
}
