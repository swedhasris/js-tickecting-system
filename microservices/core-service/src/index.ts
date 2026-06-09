import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';
import { config as loadEnv } from 'dotenv';
import { initDB } from './lib/db.js';
import { escalateStaleTickets, monitorBreaches } from './services/SLAService.js';

// Routes
import authRoutes         from './routes/auth.routes.js';
import ticketRoutes       from './routes/tickets.routes.js';
import userRoutes         from './routes/users.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import timesheetRoutes    from './routes/timesheets.routes.js';
import masterRoutes       from './routes/master.routes.js';

loadEnv();

const app  = express();
const PORT = parseInt(process.env.CORE_PORT || '3001');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ service: 'core', status: 'ok' }));
app.get('/api/db-test', async (_req, res) => {
  try {
    const { query } = await import('./lib/db.js');
    const [r] = await query('SELECT COUNT(*) as count FROM tickets');
    res.json({ status: 'connected', count: r?.count || 0 });
  } catch (e: any) { res.status(500).json({ status: 'error', error: e.message }); }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', ticketRoutes);
app.use('/api', userRoutes);
app.use('/api', notificationRoutes);
app.use('/api', timesheetRoutes);
app.use('/api', masterRoutes);

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  await initDB();

  // SLA cron jobs — identical schedule to original server.ts
  cron.schedule('*/15 * * * *', () => {
    console.log('[SLA] Escalating stale tickets...');
    escalateStaleTickets().catch(console.error);
  });
  cron.schedule('0 * * * *', () => {
    console.log('[SLA] Monitoring breaches...');
    monitorBreaches().catch(console.error);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Core Service running on http://localhost:${PORT}`);
    console.log('[Core] Tickets | Users | SLA | Auth | Timesheets | Master Data');
  });
}

start().catch(err => {
  console.error('[Core] Fatal startup error:', err);
  process.exit(1);
});
