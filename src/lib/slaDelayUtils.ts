export type SlaDelayResponseType = "initial" | "follow_up" | "rca" | null;

export type SlaDelayLogEntry = {
  id: string;
  type:
    | "threshold_reached"
    | "justification_requested"
    | "justification_submitted"
    | "follow_up_requested"
    | "follow_up_submitted"
    | "reminder_sent"
    | "escalated"
    | "breached"
    | "rca_submitted"
    | "resolved";
  timestamp: string;
  actorId: string;
  actorName: string;
  message: string;
  data?: Record<string, any>;
};

export type SlaDelayMeta = {
  active: boolean;
  monitoredSla: "response" | "resolution" | null;
  monitoredPercentage: number;
  triggeredAt: string | null;
  lastRequestedAt: string | null;
  lastSubmittedAt: string | null;
  nextFollowUpAt: string | null;
  followUpIntervalMinutes: number;
  pendingResponseType: SlaDelayResponseType;
  awaitingOwnerResponse: boolean;
  reminderCount: number;
  lastReminderAt: string | null;
  escalationLevel: number;
  escalatedAt: string | null;
  breachAt: string | null;
  breachDurationMs: number;
  rcaRequired: boolean;
  correctiveActionRequired: boolean;
  latestDelayReason: string;
  latestProgressUpdate: string;
  latestBlockers: string;
  latestEta: string;
  nextActionPlan: string;
  resolutionPercentage: number;
  rootCauseAnalysis: string;
  correctiveActionDetails: string;
  finalResolutionExplanation: string;
  // SLA Breach Reason Tracking fields
  dependencyDetails: string;
  preventiveAction: string;
  rcaEscalated?: boolean;
  breachReasonSubmittedBy?: string;
  breachReasonSubmittedAt?: string | null;
  latestStatus: "not_required" | "required" | "submitted" | "follow_up_due" | "reminder_due" | "escalated" | "breached" | "resolved";
  updatedAt: string | null;
};

export type ActiveSlaUsage = {
  active: boolean;
  slaType: "response" | "resolution" | null;
  startMs: number | null;
  deadlineMs: number | null;
  elapsedMs: number;
  totalMs: number;
  percentageUsed: number;
  breached: boolean;
};

const CLOSED_STATUSES = new Set(["resolved", "closed", "canceled", "cancelled"]);

export function toMillis(value: any): number {
  if (!value) return NaN;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value.seconds !== undefined) {
    return value.seconds * 1000 + (value.nanoseconds || 0) / 1_000_000;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return new Date(value).getTime();
}

export function isTicketClosed(status?: string | null) {
  return CLOSED_STATUSES.has((status || "").trim().toLowerCase());
}

export function parseSlaDelayMeta(value: any): SlaDelayMeta {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  const meta = parsed && typeof parsed === "object" ? parsed : {};

  return {
    active: !!meta.active,
    monitoredSla: meta.monitoredSla === "response" || meta.monitoredSla === "resolution" ? meta.monitoredSla : null,
    monitoredPercentage: Number(meta.monitoredPercentage) || 0,
    triggeredAt: meta.triggeredAt || null,
    lastRequestedAt: meta.lastRequestedAt || null,
    lastSubmittedAt: meta.lastSubmittedAt || null,
    nextFollowUpAt: meta.nextFollowUpAt || null,
    followUpIntervalMinutes: Number(meta.followUpIntervalMinutes) || 240,
    pendingResponseType: meta.pendingResponseType === "initial" || meta.pendingResponseType === "follow_up" || meta.pendingResponseType === "rca" ? meta.pendingResponseType : null,
    awaitingOwnerResponse: !!meta.awaitingOwnerResponse,
    reminderCount: Number(meta.reminderCount) || 0,
    lastReminderAt: meta.lastReminderAt || null,
    escalationLevel: Number(meta.escalationLevel) || 0,
    escalatedAt: meta.escalatedAt || null,
    breachAt: meta.breachAt || null,
    breachDurationMs: Number(meta.breachDurationMs) || 0,
    rcaRequired: !!meta.rcaRequired,
    correctiveActionRequired: !!meta.correctiveActionRequired,
    latestDelayReason: meta.latestDelayReason || "",
    latestProgressUpdate: meta.latestProgressUpdate || "",
    latestBlockers: meta.latestBlockers || "",
    latestEta: meta.latestEta || "",
    nextActionPlan: meta.nextActionPlan || "",
    resolutionPercentage: Number(meta.resolutionPercentage) || 0,
    rootCauseAnalysis: meta.rootCauseAnalysis || "",
    correctiveActionDetails: meta.correctiveActionDetails || "",
    finalResolutionExplanation: meta.finalResolutionExplanation || "",
    // SLA Breach Reason Tracking fields
    dependencyDetails: meta.dependencyDetails || "",
    preventiveAction: meta.preventiveAction || "",
    rcaEscalated: meta.rcaEscalated !== undefined ? !!meta.rcaEscalated : false,
    breachReasonSubmittedBy: meta.breachReasonSubmittedBy || "",
    breachReasonSubmittedAt: meta.breachReasonSubmittedAt || null,
    latestStatus: meta.latestStatus || "not_required",
    updatedAt: meta.updatedAt || null,
  };
}

export function parseSlaDelayLogs(value: any): SlaDelayLogEntry[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
}

export function computeActiveSlaUsage(ticket: any, nowMs = Date.now()): ActiveSlaUsage {
  const status = ticket?.status || "";
  if (isTicketClosed(status)) {
    return {
      active: false,
      slaType: null,
      startMs: null,
      deadlineMs: null,
      elapsedMs: 0,
      totalMs: 0,
      percentageUsed: 0,
      breached: false,
    };
  }

  const totalPausedTime = Number(ticket?.totalPausedTime || ticket?.total_paused_time || 0) || 0;

  const responseDeadline = toMillis(ticket?.responseDeadline || ticket?.response_deadline);
  const responseStart = toMillis(ticket?.responseSlaStartTime || ticket?.response_sla_start_time || ticket?.createdAt || ticket?.created_at);
  const firstResponseAt = toMillis(ticket?.firstResponseAt || ticket?.first_response_at);

  if (!Number.isNaN(responseDeadline) && Number.isFinite(responseDeadline) && Number.isNaN(firstResponseAt)) {
    const totalMs = Math.max(0, responseDeadline - responseStart);
    const elapsedMs = Math.max(0, nowMs - responseStart - totalPausedTime);
    const percentageUsed = totalMs > 0 ? Math.max(0, (elapsedMs / totalMs) * 100) : 0;
    return {
      active: true,
      slaType: "response",
      startMs: responseStart,
      deadlineMs: responseDeadline,
      elapsedMs,
      totalMs,
      percentageUsed,
      breached: nowMs > responseDeadline + totalPausedTime,
    };
  }

  const resolutionDeadline = toMillis(ticket?.resolutionDeadline || ticket?.resolution_deadline);
  const resolutionStart = toMillis(ticket?.resolutionSlaStartTime || ticket?.resolution_sla_start_time || ticket?.firstResponseAt || ticket?.createdAt || ticket?.created_at);
  const resolvedAt = toMillis(ticket?.resolvedAt || ticket?.resolved_at);

  if (!Number.isNaN(resolutionDeadline) && Number.isFinite(resolutionDeadline) && Number.isNaN(resolvedAt)) {
    const totalMs = Math.max(0, resolutionDeadline - resolutionStart);
    const elapsedMs = Math.max(0, nowMs - resolutionStart - totalPausedTime);
    const percentageUsed = totalMs > 0 ? Math.max(0, (elapsedMs / totalMs) * 100) : 0;
    return {
      active: true,
      slaType: "resolution",
      startMs: resolutionStart,
      deadlineMs: resolutionDeadline,
      elapsedMs,
      totalMs,
      percentageUsed,
      breached: nowMs > resolutionDeadline + totalPausedTime,
    };
  }

  return {
    active: false,
    slaType: null,
    startMs: null,
    deadlineMs: null,
    elapsedMs: 0,
    totalMs: 0,
    percentageUsed: 0,
    breached: false,
  };
}

export function getEffectiveSlaDelayState(ticket: any, nowMs = Date.now()) {
  const meta = parseSlaDelayMeta(ticket?.slaDelayMeta || ticket?.sla_delay_meta_json);
  const logs = parseSlaDelayLogs(ticket?.slaDelayLogs || ticket?.sla_delay_logs_json);
  const usage = computeActiveSlaUsage(ticket, nowMs);

  const thresholdReached = usage.active && usage.percentageUsed >= 25;
  const awaitingInitialJustification = thresholdReached && (!meta.triggeredAt || meta.pendingResponseType === "initial" || (!meta.lastSubmittedAt && meta.awaitingOwnerResponse));
  const followUpDue = !!meta.nextFollowUpAt && toMillis(meta.nextFollowUpAt) <= nowMs && !isTicketClosed(ticket?.status) && !meta.rcaRequired;
  const awaitingRca = meta.rcaRequired && meta.pendingResponseType === "rca";
  const awaitingOwnerResponse = meta.awaitingOwnerResponse || awaitingInitialJustification || followUpDue || awaitingRca;

  return {
    meta,
    logs,
    usage,
    thresholdReached,
    awaitingInitialJustification,
    followUpDue,
    awaitingRca,
    awaitingOwnerResponse,
  };
}

export function createDefaultSlaDelayMeta(nowIso: string, usage?: ActiveSlaUsage): SlaDelayMeta {
  return {
    active: !!usage?.active,
    monitoredSla: usage?.slaType || null,
    monitoredPercentage: usage?.percentageUsed || 0,
    triggeredAt: usage?.active ? nowIso : null,
    lastRequestedAt: usage?.active ? nowIso : null,
    lastSubmittedAt: null,
    nextFollowUpAt: null,
    followUpIntervalMinutes: 240,
    pendingResponseType: usage?.active ? "initial" : null,
    awaitingOwnerResponse: !!usage?.active,
    reminderCount: 0,
    lastReminderAt: null,
    escalationLevel: 0,
    escalatedAt: null,
    breachAt: null,
    breachDurationMs: 0,
    rcaRequired: false,
    correctiveActionRequired: false,
    latestDelayReason: "",
    latestProgressUpdate: "",
    latestBlockers: "",
    latestEta: "",
    nextActionPlan: "",
    resolutionPercentage: 0,
    rootCauseAnalysis: "",
    correctiveActionDetails: "",
    finalResolutionExplanation: "",
    // SLA Breach Reason Tracking fields
    dependencyDetails: "",
    preventiveAction: "",
    rcaEscalated: false,
    breachReasonSubmittedBy: "",
    breachReasonSubmittedAt: null,
    latestStatus: usage?.active ? "required" : "not_required",
    updatedAt: nowIso,
  };
}
