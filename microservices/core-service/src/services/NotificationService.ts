import { execute } from '../lib/db.js';

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: string,
  ticketId?: string
) {
  try {
    await execute(
      'INSERT INTO notifications (user_id, title, message, type, ticket_id, is_read) VALUES (?, ?, ?, ?, ?, 0)',
      [userId, title, message, type, ticketId || null]
    );
  } catch (e: any) {
    console.error('[NotificationService]', e.message);
  }
}

export async function notifyTicketCreated(
  createdBy: string | undefined,
  assignedTo: string | undefined,
  ticketNumber: string,
  assignmentGroup: string,
  callerName: string,
  agentUids: string[]
) {
  if (createdBy) {
    await createNotification(createdBy, 'Ticket Created Successfully',
      `Ticket ID: ${ticketNumber}. Assigned to: ${assignmentGroup || 'Support Team'}`,
      'ticket_created', ticketNumber);
  }

  if (assignedTo) {
    await createNotification(assignedTo, 'A ticket has been assigned to you',
      `Ticket ID: ${ticketNumber}. Created by: ${callerName}`,
      'ticket_assigned', ticketNumber);
  } else {
    for (const uid of agentUids) {
      await createNotification(uid, 'New Unassigned Ticket',
        `${callerName} created ticket ${ticketNumber}`,
        'ticket_unassigned', ticketNumber);
    }
  }
}

export async function notifyStatusChanged(
  userId: string,
  ticketNumber: string,
  newStatus: string
) {
  await createNotification(userId, 'Ticket Status Updated',
    `Your ticket ${ticketNumber} status changed to ${newStatus}`,
    'status_changed', ticketNumber);
}

export async function notifyAssigned(
  userId: string,
  ticketNumber: string
) {
  await createNotification(userId, 'Ticket Assigned to You',
    `Ticket ${ticketNumber} has been assigned to you.`,
    'ticket_assigned', ticketNumber);
}
