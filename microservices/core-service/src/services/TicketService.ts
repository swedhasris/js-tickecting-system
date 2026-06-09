import { query, execute, formatDate } from '../lib/db.js';

// ─── Priority / SLA helpers ────────────────────────────────────────────────────

const PRIORITY_RESPONSE_HOURS: Record<string, number> = {
  '1 - Critical': 1,
  '2 - High':     4,
  '3 - Moderate': 8,
  '4 - Low':      24,
};
const PRIORITY_RESOLUTION_HOURS: Record<string, number> = {
  '1 - Critical': 4,
  '2 - High':     8,
  '3 - Moderate': 24,
  '4 - Low':      72,
};

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export async function generateTicketNumber(): Promise<string> {
  return 'INC' + Math.floor(1_000_000 + Math.random() * 9_000_000);
}

// ─── Auto-assignment logic ─────────────────────────────────────────────────────

export function resolveAssignmentGroup(category?: string): string {
  switch (category) {
    case 'Network':  return 'Network Team';
    case 'Hardware': return 'Hardware Support';
    case 'Software': return 'App Support';
    case 'Database': return 'DBA Team';
    default:         return 'Service Desk';
  }
}

// ─── Create ticket ─────────────────────────────────────────────────────────────

export async function createTicket(body: any, hasAdminAccess = false): Promise<any> {
  if (!hasAdminAccess) {
    delete body.incidentCategory;
    delete body.incident_category;
  }

  const ticketNumber = await generateTicketNumber();
  const assignmentGroup = body.assignmentGroup || resolveAssignmentGroup(body.category);
  const now = new Date();
  const priority = body.priority || '4 - Low';

  const ticketData: any = {
    ticket_number:      ticketNumber,
    caller:             body.caller || 'System',
    category:           body.category || 'Inquiry / Help',
    incident_category:  body.incidentCategory || body.incident_category || null,
    title:              body.title,
    description:        body.description,
    status:             'New',
    priority,
    impact:             body.impact || '3 - Low',
    urgency:            body.urgency || '3 - Low',
    channel:            body.channel || 'Self-service',
    assignment_group:   assignmentGroup,
    assigned_to:        body.assignedTo || null,
    assigned_to_name:   body.assignedToName || null,
    created_by:         body.createdBy || body.caller || 'System',
    created_by_name:    body.createdByName || body.caller || 'System',
    service:            body.service || null,
    service_offering:   body.serviceOffering || null,
    cmdb_item:          body.cmdbItem || null,
    subcategory:        body.subcategory || null,
    response_deadline:  formatDate(addHours(now, PRIORITY_RESPONSE_HOURS[priority] ?? 24)),
    resolution_deadline: formatDate(addHours(now, PRIORITY_RESOLUTION_HOURS[priority] ?? 72)),
    sla_delay_meta_json:  body.slaDelayMeta  ? JSON.stringify(body.slaDelayMeta)  : null,
    sla_delay_logs_json:  body.slaDelayLogs  ? JSON.stringify(body.slaDelayLogs)  : JSON.stringify([]),
  };

  const fields = Object.keys(ticketData).filter(k => ticketData[k] !== null && ticketData[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => ticketData[k]);

  const result = await execute(
    `INSERT INTO tickets (${fields.join(', ')}) VALUES (${placeholders})`,
    values
  );
  const ticketId = result.insertId;

  // Save custom fields
  if (body.customFields && typeof body.customFields === 'object') {
    for (const [catId, valText] of Object.entries(body.customFields)) {
      if (valText) {
        const cats = await query('SELECT name FROM incident_categories WHERE id = ?', [catId]);
        const catName = cats[0]?.name || `Field_${catId}`;
        await execute(
          'INSERT INTO ticket_custom_fields (ticket_id, category_id, category_name, value_text) VALUES (?, ?, ?, ?)',
          [ticketId.toString(), catId, catName, valText]
        );
      }
    }
  }

  // Timeline entry
  await execute(
    'INSERT INTO ticket_activities (ticket_id, activity_type, visibility_type, created_by, created_by_name, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [ticketId, 'system', 'public',
     body.caller || 'System',
     body.createdByName || body.caller || 'System',
     'Ticket created',
     JSON.stringify(ticketData)]
  );

  if (['1 - Critical', '2 - High'].includes(priority)) {
    await execute(
      'INSERT INTO ticket_activities (ticket_id, activity_type, visibility_type, created_by, created_by_name, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ticketId, 'system', 'internal', 'System Automation', 'System Automation',
       'Manager Notified (High Priority)', JSON.stringify({ reason: 'High priority ticket created' })]
    );
  }

  const [created] = await query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  return created;
}

// ─── Update ticket ─────────────────────────────────────────────────────────────

export async function updateTicket(id: string, body: any, hasAdminAccess = false): Promise<any> {
  const [ticket] = await query('SELECT * FROM tickets WHERE id = ?', [id]);
  if (!ticket) throw new Error('Ticket not found');

  // SLA breach RCA validation
  if (['Resolved', 'Closed'].includes(body.status)) {
    let slaMeta: any = {};
    try { slaMeta = JSON.parse(ticket.sla_delay_meta_json || '{}'); } catch {}
    let isBreached = slaMeta.latestStatus === 'breached' || slaMeta.breachAt;

    if (ticket.resolution_deadline) {
      const deadline = new Date(ticket.resolution_deadline).getTime();
      if (Date.now() > deadline && !ticket.resolved_at) isBreached = true;
    }

    if (isBreached) {
      const payloadMeta = body.slaDelayMeta || body.sla_delay_meta_json;
      const nm = payloadMeta
        ? (typeof payloadMeta === 'string' ? JSON.parse(payloadMeta) : payloadMeta)
        : slaMeta;

      const hasRca = !!(nm.breachReasonSubmittedAt || nm.rootCauseAnalysis?.trim());
      const reqMissing = !nm.rootCauseAnalysis?.trim() || !nm.dependencyDetails?.trim() ||
                         !nm.correctiveActionDetails?.trim() || !nm.preventiveAction?.trim() ||
                         !nm.finalResolutionExplanation?.trim();

      if (!hasRca && reqMissing) {
        throw { status: 400, message: 'SLA Breach RCA is mandatory before resolving or closing a breached ticket.' };
      }
    }
  }

  // Points calculation
  let points = 0;
  if (['Resolved', 'Closed'].includes(body.status) && !ticket.resolved_at) {
    if (ticket.resolution_deadline) {
      const deadline = new Date(ticket.resolution_deadline).getTime();
      const createdAt = new Date(ticket.created_at).getTime();
      if (Date.now() < deadline) {
        const totalSla = deadline - createdAt;
        const timeSaved = deadline - Date.now();
        points = Math.max(10, Math.round((timeSaved / totalSla) * 100));
      } else {
        points = 5;
      }
    }
  }

  const keyMap: Record<string, string> = {
    assignedTo: 'assigned_to', assignedToName: 'assigned_to_name',
    assignmentGroup: 'assignment_group', responseDeadline: 'response_deadline',
    resolutionDeadline: 'resolution_deadline', responseSlaStatus: 'response_sla_status',
    resolutionSlaStatus: 'resolution_sla_status', firstResponseAt: 'first_response_at',
    totalPausedTime: 'total_paused_time', onHoldStart: 'on_hold_start',
    incidentCategory: 'incident_category', resolvedBy: 'resolved_by',
    resolvedAt: 'resolved_at', closedBy: 'closed_by', closedAt: 'closed_at',
    slaDelayMeta: 'sla_delay_meta_json', slaDelayLogs: 'sla_delay_logs_json',
  };

  const updateData: any = { points: (ticket.points || 0) + points, updated_at: formatDate(new Date()) };
  const ignored = new Set(['id', 'updatedById', 'updatedBy', 'customFields', 'history', 'points', 'updated_at', 'createdAt', 'updatedAt']);

  for (const [key, value] of Object.entries(body)) {
    if (ignored.has(key)) continue;
    const dbKey = keyMap[key] || key;
    if ((key === 'slaDelayMeta' || key === 'slaDelayLogs') && value && typeof value === 'object') {
      updateData[dbKey] = JSON.stringify(value);
    } else {
      updateData[dbKey] = value;
    }
  }

  if (!hasAdminAccess) delete updateData.incident_category;
  if (['Resolved', 'Closed'].includes(body.status)) {
    updateData.resolved_at = formatDate(new Date());
  }

  // Build UPDATE
  let columns: string[] = [];
  try {
    const cols = await query('SHOW COLUMNS FROM tickets');
    columns = cols.map((c: any) => c.Field);
  } catch {
    try {
      const pragmaRows = await query("PRAGMA table_info(tickets)", []);
      columns = pragmaRows.map((c: any) => c.name);
    } catch {}
  }

  if (columns.length) {
    const valid = new Set(columns);
    for (const k of Object.keys(updateData)) {
      if (!valid.has(k)) delete updateData[k];
    }
  }

  const fields = Object.keys(updateData).filter(k => k !== 'id' && updateData[k] !== undefined);
  const setClause = fields.map(k => `${k} = ?`).join(', ');
  const values = [...fields.map(k => updateData[k]), id];

  await execute(`UPDATE tickets SET ${setClause} WHERE id = ?`, values);

  // Save custom fields
  if (body.customFields && typeof body.customFields === 'object') {
    await execute('DELETE FROM ticket_custom_fields WHERE ticket_id = ?', [id.toString()]);
    for (const [catId, valText] of Object.entries(body.customFields)) {
      if (valText) {
        const cats = await query('SELECT name FROM incident_categories WHERE id = ?', [catId]);
        const catName = cats[0]?.name || `Field_${catId}`;
        await execute(
          'INSERT INTO ticket_custom_fields (ticket_id, category_id, category_name, value_text) VALUES (?, ?, ?, ?)',
          [id.toString(), catId, catName, valText]
        );
      }
    }
  }

  // Activity entry
  let actionMsg = 'Ticket updated';
  if (body.status && body.status !== ticket.status)        actionMsg = `Status changed to ${body.status}`;
  else if (body.assignedTo && body.assignedTo !== ticket.assigned_to) actionMsg = 'Assigned to updated';
  else if (body.priority && body.priority !== ticket.priority)        actionMsg = `Priority changed to ${body.priority}`;

  await execute(
    'INSERT INTO ticket_activities (ticket_id, activity_type, visibility_type, created_by, created_by_name, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, 'status_change', 'public',
     body.updatedById || 'System', body.updatedBy || 'System',
     actionMsg,
     JSON.stringify({ oldStatus: ticket.status, newStatus: body.status, updates: updateData })]
  );

  const [updated] = await query('SELECT * FROM tickets WHERE id = ?', [id]);
  return { ticket: updated, pointsAwarded: points, prevTicket: ticket };
}

// ─── Get single ticket with related data ──────────────────────────────────────

export async function getTicket(id: string): Promise<any> {
  const [ticket] = await query('SELECT * FROM tickets WHERE id = ?', [id]);
  if (!ticket) return null;

  const comments = await query('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC', [ticket.id]);
  const history  = await query('SELECT * FROM ticket_history WHERE ticket_id = ? ORDER BY timestamp DESC', [ticket.id]);
  const cfRows   = await query('SELECT category_id, category_name, value_text FROM ticket_custom_fields WHERE ticket_id = ?', [ticket.id.toString()]);

  const customFields: Record<string, string> = {};
  cfRows.forEach((r: any) => { customFields[r.category_id.toString()] = r.value_text; });

  let slaDelayMeta = {}, slaDelayLogs: any[] = [];
  try { slaDelayMeta = JSON.parse(ticket.sla_delay_meta_json || '{}'); } catch {}
  try { slaDelayLogs = JSON.parse(ticket.sla_delay_logs_json || '[]'); } catch {}

  return {
    id: ticket.id.toString(),
    ...ticket,
    slaDelayMeta,
    slaDelayLogs,
    customFields,
    comments: comments.map((c: any) => ({ id: c.id.toString(), ...c })),
    history:  history.map((h: any)  => ({ id: h.id.toString(), ...h })),
  };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function getDailyLeaderboard(): Promise<any[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await query(
    `SELECT assigned_to, assigned_to_name,
            SUM(points) AS total_points,
            COUNT(*) AS resolved_count
     FROM tickets
     WHERE status IN ('Resolved','Closed')
       AND resolved_at >= ?
       AND assigned_to IS NOT NULL
     GROUP BY assigned_to, assigned_to_name
     ORDER BY total_points DESC`,
    [formatDate(today)]
  );
  return rows.map((r: any) => ({
    id:            r.assigned_to,
    name:          r.assigned_to_name || r.assigned_to,
    points:        r.total_points || 0,
    resolvedCount: r.resolved_count || 0,
  }));
}
