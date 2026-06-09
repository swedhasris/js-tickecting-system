/**
 * Re-export SLA delay utilities from the tis lib.
 * The business logic is unchanged — only location changes.
 */

export function parseSlaDelayMeta(json: string | null): any {
  if (!json) return {
    active: false, monitoredSla: null, monitoredPercentage: 0,
    triggeredAt: null, lastRequestedAt: null, lastSubmittedAt: null,
    nextFollowUpAt: null, followUpIntervalMinutes: 240,
    pendingResponseType: null, awaitingOwnerResponse: false,
    reminderCount: 0, lastReminderAt: null, escalationLevel: 0,
    escalatedAt: null, breachAt: null, breachDurationMs: 0,
    rcaRequired: false, correctiveActionRequired: false,
    latestDelayReason: '', latestProgressUpdate: '',
    latestBlockers: '', latestEta: '', nextActionPlan: '',
    resolutionPercentage: 0, rootCauseAnalysis: '',
    correctiveActionDetails: '', finalResolutionExplanation: '',
    dependencyDetails: '', preventiveAction: '',
    rcaEscalated: false, breachReasonSubmittedBy: '',
    breachReasonSubmittedAt: null, latestStatus: 'not_required',
    updatedAt: null,
  };
  try { return JSON.parse(json); } catch { return {}; }
}

export function parseSlaDelayLogs(json: string | null): any[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}
