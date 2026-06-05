import React from "react";
import { AlertCircle, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SlaDelayResponseType } from "../lib/slaDelayUtils";

type Props = {
  open: boolean;
  pendingType: SlaDelayResponseType;
  saving: boolean;
  monitoredSla: string | null;
  percentageUsed: number;
  reminderCount: number;
  breachDurationLabel?: string;
  form: {
    delayReason: string;
    progressUpdate: string;
    blockers: string;
    eta: string;
    nextActionPlan: string;
    resolutionPercentage: string;
    rootCauseAnalysis: string;
    correctiveActionDetails: string;
    finalResolutionExplanation: string;
    dependencyDetails: string;
    preventiveAction: string;
  };
  onChange: (field: string, value: string) => void;
  onSubmit: () => void;
};

export function SLADelayDialog({
  open,
  pendingType,
  saving,
  monitoredSla,
  percentageUsed,
  reminderCount,
  breachDurationLabel,
  form,
  onChange,
  onSubmit,
}: Props) {
  if (!open || !pendingType) return null;

  const isRca = pendingType === "rca";
  const isFollowUp = pendingType === "follow_up";

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${isRca ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
              {isRca ? <ShieldAlert className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isRca ? "SLA Breach RCA Required" : isFollowUp ? "SLA Follow-Up Update Required" : "SLA Delay Justification Required"}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {isRca
                  ? `This ticket breached the ${monitoredSla || "active"} SLA${breachDurationLabel ? ` by ${breachDurationLabel}` : ""}.`
                  : `This ticket has consumed ${Math.round(percentageUsed)}% of its ${monitoredSla || "active"} SLA and requires an accountable update.`}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div className="font-semibold">Reminders sent: {reminderCount}</div>
            <div className="mt-1 flex items-center justify-end gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Owner response is mandatory</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {!isRca && (
            <>
              {!isFollowUp && (
                <Field label="Reason for delay" required>
                  <textarea
                    value={form.delayReason}
                    onChange={(e) => onChange("delayReason", e.target.value)}
                    className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </Field>
              )}

              <Field label={isFollowUp ? "Latest progress update" : "Current work progress"} required>
                <textarea
                  value={form.progressUpdate}
                  onChange={(e) => onChange("progressUpdate", e.target.value)}
                  className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={isFollowUp ? "Current blocker status" : "Blockers or dependencies"}>
                  <textarea
                    value={form.blockers}
                    onChange={(e) => onChange("blockers", e.target.value)}
                    className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </Field>
                <div className="space-y-4">
                  <Field label={isFollowUp ? "Updated ETA" : "Expected resolution date and time"} required>
                    <input
                      type="datetime-local"
                      value={form.eta}
                      onChange={(e) => onChange("eta", e.target.value)}
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </Field>
                  {isFollowUp && (
                    <Field label="Resolution percentage" required>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={form.resolutionPercentage}
                        onChange={(e) => onChange("resolutionPercentage", e.target.value)}
                        className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </Field>
                  )}
                </div>
              </div>

              {!isFollowUp && (
                <Field label="Next action plan" required>
                  <textarea
                    value={form.nextActionPlan}
                    onChange={(e) => onChange("nextActionPlan", e.target.value)}
                    className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </Field>
              )}
            </>
          )}

          {isRca && (
            <>
              <Field label="Root Cause Analysis (RCA)" required>
                <textarea
                  value={form.rootCauseAnalysis}
                  onChange={(e) => onChange("rootCauseAnalysis", e.target.value)}
                  placeholder="Describe why the SLA was breached. What was the root cause of the delay?"
                  className="w-full min-h-28 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </Field>
              <Field label="Dependency or Blocker Details" required>
                <textarea
                  value={form.dependencyDetails}
                  onChange={(e) => onChange("dependencyDetails", e.target.value)}
                  placeholder="Describe any third-party, internal dependencies, or blockers that caused this delay (e.g. waiting for vendor approval, hardware delivery, customer response)."
                  className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </Field>
              <Field label="Corrective action taken" required>
                <textarea
                  value={form.correctiveActionDetails}
                  onChange={(e) => onChange("correctiveActionDetails", e.target.value)}
                  placeholder="What steps were taken to resolve the issue after the breach?"
                  className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </Field>
              <Field label="Preventive action for future occurrences" required>
                <textarea
                  value={form.preventiveAction}
                  onChange={(e) => onChange("preventiveAction", e.target.value)}
                  placeholder="What will be done to prevent this type of SLA breach from happening again?"
                  className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </Field>
              <Field label="Final resolution explanation" required>
                <textarea
                  value={form.finalResolutionExplanation}
                  onChange={(e) => onChange("finalResolutionExplanation", e.target.value)}
                  placeholder="Provide a complete summary of how the issue was ultimately resolved."
                  className="w-full min-h-24 rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Updated ETA" required>
                  <input
                    type="datetime-local"
                    value={form.eta}
                    onChange={(e) => onChange("eta", e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </Field>
                <Field label="Resolution percentage" required>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.resolutionPercentage}
                    onChange={(e) => onChange("resolutionPercentage", e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </Field>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            This requirement is enforced for accountability and SLA audit compliance.
          </p>
          <Button
            onClick={onSubmit}
            disabled={saving}
            className={isRca ? "bg-red-600 hover:bg-red-700 text-white" : "bg-sn-green text-sn-dark hover:bg-sn-green/90"}
          >
            {saving ? "Saving..." : isRca ? "Submit RCA" : isFollowUp ? "Submit Follow-Up" : "Submit Justification"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
        {required && <span className="text-red-500 mr-1">*</span>}
        {label}
      </div>
      {children}
    </label>
  );
}
