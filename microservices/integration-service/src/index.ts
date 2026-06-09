import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';
import { config as loadEnv } from 'dotenv';
import { processEmailQueue } from './services/EmailService.js';
import { testGraphConnection } from './services/GraphEmailService.js';

import emailRoutes from './routes/email.routes.js';
import graphRoutes from './routes/graph.routes.js';
import aiRoutes    from './routes/ai.routes.js';

loadEnv();

const app  = express();
const PORT = parseInt(process.env.INTEGRATION_PORT || '3002');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] }));
app.use(express.json({ limit: '15mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ service: 'integration', status: 'ok' }));

// Serve uploaded files (screenshots, attachments)
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express2 from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, '..', '..', '..', 'tis', 'public', 'uploads');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express2.static(uploadsDir));
app.use('/captures', express2.static(join(__dirname, '..', '..', '..', 'tis', 'public', 'captures')));

app.use('/api', emailRoutes);
app.use('/api', graphRoutes);
app.use('/api', aiRoutes);

async function start() {
  // Email queue — every 30 seconds
  cron.schedule('*/30 * * * * *', () => {
    processEmailQueue().catch(() => {});
  });

  // IMAP polling — every 1 minute
  cron.schedule('*/1 * * * *', async () => {
    console.log('[Integration] Email poll cycle...');
    // OmniChannel IMAP polling handled by tis server or via Graph API
  });

  // Startup Graph check
  if (process.env.GRAPH_TENANT_ID && process.env.GRAPH_TENANT_ID !== 'your_tenant_id_here') {
    testGraphConnection().then(r => {
      if (r.ok) console.log('[Graph] ✅', r.msg);
      else      console.warn('[Graph] ⚠️', r.msg);
    }).catch(() => {});
  } else {
    console.log('[Graph] ⚠️  Credentials not set — visit /api/graph/setup for instructions');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n📧 Integration Service running on http://localhost:${PORT}`);
    console.log('[Integration] Email | Graph API | Gemini AI | Webhooks');
  });
}

start().catch(err => { console.error('[Integration] Fatal:', err); process.exit(1); });
