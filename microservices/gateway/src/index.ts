import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import proxy from 'express-http-proxy';
import { createServer } from 'http';
import httpProxy from 'http-proxy';
import { config as loadEnv } from 'dotenv';

loadEnv();

const app = express();
const PORT = parseInt(process.env.GATEWAY_PORT || '3000');
const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://localhost:8080';
const INTEGRATION_SERVICE_URL = process.env.INTEGRATION_SERVICE_URL || 'http://localhost:3002';

app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));

// Define routing logic for API requests
const routeMappings = [
  { prefix: '/api/auth', target: CORE_SERVICE_URL },
  { prefix: '/api/tickets', target: CORE_SERVICE_URL },
  { prefix: '/api/users', target: CORE_SERVICE_URL },
  { prefix: '/api/timesheets', target: CORE_SERVICE_URL },
  { prefix: '/api/time-cards', target: CORE_SERVICE_URL },
  { prefix: '/api/assets', target: CORE_SERVICE_URL },
  { prefix: '/api/approvals', target: CORE_SERVICE_URL },
  { prefix: '/api/problems', target: CORE_SERVICE_URL },
  { prefix: '/api/changes', target: CORE_SERVICE_URL },
  { prefix: '/api/knowledge', target: CORE_SERVICE_URL },
  { prefix: '/api/health', target: CORE_SERVICE_URL },
  { prefix: '/api/db-test', target: CORE_SERVICE_URL },

  // Integration Service endpoints
  { prefix: '/api/notifications', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/ai', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/meetings', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/ts-meetings', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/message-history', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/email-integrations', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/email-configs', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/moms', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/work-sessions', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/work-notes', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/sla-breaches', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/companies', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/incident-categories', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/activity-sessions', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/activity-entries', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/upload-screenshot', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/settings/branding', target: INTEGRATION_SERVICE_URL },
  { prefix: '/api/input-stats', target: INTEGRATION_SERVICE_URL },
];

// Mount proxies
routeMappings.forEach(({ prefix, target }) => {
  app.use(prefix, proxy(target, {
    proxyReqPathResolver: (req) => {
      // Keep the prefix path intact
      return prefix + req.url;
    }
  }));
});

// Fallback health check
app.get('/gateway-health', (req, res) => {
  res.json({ service: 'gateway', status: 'ok' });
});

// Create HTTP server
const server = createServer(app);

// Proxy WebSocket upgrades to the integration service (for real-time meeting chats)
const wsProxy = httpProxy.createProxyServer({
  target: INTEGRATION_SERVICE_URL,
  ws: true
});

server.on('upgrade', (req, socket, head) => {
  console.log('[Gateway] WebSocket connection upgrade detected, proxying to:', INTEGRATION_SERVICE_URL);
  wsProxy.ws(req, socket, head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 API Gateway running on http://localhost:${PORT}`);
  console.log(`- Core Service target: ${CORE_SERVICE_URL}`);
  console.log(`- Integration Service target: ${INTEGRATION_SERVICE_URL}`);
});
