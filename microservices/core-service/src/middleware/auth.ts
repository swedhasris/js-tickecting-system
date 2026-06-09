import { Request, Response, NextFunction } from 'express';
import { query } from '../lib/db.js';

/**
 * Simple header-based auth middleware.
 * Accepts x-user-uid header from the React frontend (same as existing system).
 * Attaches user record to req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const uid = req.headers['x-user-uid'] as string;
  if (!uid) return res.status(401).json({ error: 'Unauthenticated' });
  try {
    const rows = await query('SELECT * FROM users WHERE uid = ? AND is_active = 1 LIMIT 1', [uid]);
    if (!rows.length) return res.status(401).json({ error: 'User not found' });
    (req as any).user = rows[0];
    next();
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'h_' + Math.abs(hash).toString(36) + '_' + str.length;
}
