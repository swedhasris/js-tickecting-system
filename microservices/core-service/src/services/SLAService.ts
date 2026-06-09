import { query, execute, formatDate } from '../lib/db.js';

// ─── SLA escalation engine (mirrors escalateStaleTickets) ─────────────────────

export async function escalateStaleTickets(): Promise<void> {
  const now = new Date();
  const tickets = await query(
    "SELECT * FROM tickets WHERE status NOT IN ('Resolved','Closed','Canceled')"
  );

  for (const ticket of tickets) {
    if (['On Hold', 'Waiting for Customer'].includes(ticket.status)) continue;

    const updates: any = {};
    const historyEntries: string[] = [];

    // ── Response SLA ──────────────────────────────────────────────────────────
    if (ticket.response_deadline && !ticket.first_response_at &&
        ticket.response_sla_status !== 'Breached' &&
        ticket.response_sla_status !== 'Completed') {
      const deadline  = new Date(ticket.response_deadline).getTime();
      const createdAt = new Date(ticket.created_at).getTime();
      if (!isNaN(deadline) && !isNaN(createdAt)) {
        const diff        = deadline - now.getTime();
        const totalWindow = deadline - createdAt;

        if (diff <= 0) {
          updates.response_sla_status = 'Breached';
          historyEntries.push('Response SLA BREACHED');
        } else if (totalWindow > 0 && diff < totalWindow * 0.2 && ticket.response_sla_status !== 'At Risk') {
          updates.response_sla_status = 'At Risk';
        }
      }
    }

    // ── Resolution SLA ────────────────────────────────────────────────────────
    if (ticket.resolution_deadline && !ticket.resolved_at &&
        ticket.resolution_sla_status !== 'Breached' &&
        ticket.resolution_sla_status !== 'Completed') {
      const deadline  = new Date(ticket.resolution_deadline).getTime();
      const createdAt = new Date(ticket.created_at).getTime();
      if (!isNaN(deadline) && !isNaN(createdAt)) {
        const diff        = deadline - now.getTime();
        const totalWindow = deadline - createdAt;

        if (diff <= 0) {
          updates.resolution_sla_status = 'Breached';
          updates.priority = '1 - Critical';
          historyEntries.push('Resolution SLA BREACHED: Ticket escalated to Critical');
        } else if (totalWindow > 0 && diff < totalWindow * 0.2 && ticket.resolution_sla_status !== 'At Risk') {
          updates.resolution_sla_status = 'At Risk';
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      const fields    = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values    = [...Object.values(updates), formatDate(new Date()), ticket.id];
      await execute(`UPDATE tickets SET ${fields}, updated_at = ? WHERE id = ?`, values);

      for (const entry of historyEntries) {
        await execute(
          'INSERT INTO ticket_activities (ticket_id, activity_type, visibility_type, created_by, created_by_name, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [ticket.id, 'sla_triggered', 'internal', 'SLA Engine', 'SLA Engine', entry, JSON.stringify({ timestamp: now.toISOString() })]
        );
      }
    }
  }
}

// ─── SLA monitoring engine (mirrors SLAEngine.monitorBreaches) ────────────────

export async function monitorBreaches(): Promise<void> {
  const now    = new Date();
  const nowStr = now.toISOString();

  // Response SLAs
  const responseSlas = await query(`
    SELECT id, ticket_number, response_deadline, response_sla_start_time, response_sla_status, created_at
    FROM tickets
    WHERE response_sla_status NOT IN ('Completed','Resolved')
  `);

  for (const ticket of responseSlas) {
    const deadline = new Date(ticket.response_deadline).getTime();
    const start    = new Date(ticket.response_sla_start_time || ticket.created_at).getTime();
    const total    = deadline - start;
    const elapsed  = now.getTime() - start;
    const pct      = total > 0 ? (elapsed / total) * 100 : 0;

    if (pct >= 100 && ticket.response_sla_status !== 'Breached') {
      await execute("UPDATE tickets SET response_sla_status = 'Breached' WHERE id = ?", [ticket.id]);
      await logSLAEvent(ticket.id, 'Response', 'Breach', nowStr, 'SLA Used 100%');
    } else if (pct >= 90) {
      await logSLAEvent(ticket.id, 'Response', 'Warning', nowStr, 'SLA Used 90% — Team Lead Notified');
    } else if (pct >= 80) {
      await logSLAEvent(ticket.id, 'Response', 'Warning', nowStr, 'SLA Used 80% — Engineer Notified');
    }
  }

  // Resolution SLAs
  const resolutionSlas = await query(`
    SELECT id, ticket_number, resolution_deadline, resolution_sla_start_time, resolution_sla_status, created_at
    FROM tickets
    WHERE resolution_sla_status = 'In Progress'
      AND status NOT IN ('Resolved','Closed','On Hold','Waiting for Customer')
  `);

  for (const ticket of resolutionSlas) {
    const deadline = new Date(ticket.resolution_deadline).getTime();
    const start    = new Date(ticket.resolution_sla_start_time || ticket.created_at).getTime();
    const total    = deadline - start;
    const elapsed  = now.getTime() - start;
    const pct      = total > 0 ? (elapsed / total) * 100 : 0;

    if (pct >= 100 && ticket.resolution_sla_status !== 'Breached') {
      await execute("UPDATE tickets SET resolution_sla_status = 'Breached' WHERE id = ?", [ticket.id]);
      await logSLAEvent(ticket.id, 'Resolution', 'Breach', nowStr, 'SLA Used 100%');
    } else if (pct >= 90) {
      await logSLAEvent(ticket.id, 'Resolution', 'Warning', nowStr, 'SLA Used 90%');
    } else if (pct >= 80) {
      await logSLAEvent(ticket.id, 'Resolution', 'Warning', nowStr, 'SLA Used 80%');
    }
  }
}

async function logSLAEvent(ticketId: any, slaType: string, eventType: string, timestamp: string, reason: string) {
  try {
    await execute(
      'INSERT INTO sla_audit_logs (ticket_id, sla_type, event_type, timestamp, reason) VALUES (?, ?, ?, ?, ?)',
      [String(ticketId), slaType, eventType, timestamp, reason]
    );
  } catch { /* non-critical */ }
}
