import React, { useState, useEffect, useCallback } from "react";
import { Clock, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, CheckCircle, AlertCircle, BarChart2, Bot, Zap } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import html2canvas from "html2canvas";

const STATUS_COLORS: Record<string, React.CSSProperties> = {
  Draft:     { backgroundColor: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' },
  Submitted: { backgroundColor: 'rgba(59,130,246,0.15)',  color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' },
  Approved:  { backgroundColor: 'rgba(34,197,94,0.15)',   color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' },
  Rejected:  { backgroundColor: 'rgba(239,68,68,0.15)',   color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
};

const DEFAULT_TASKS = [
  "General Support", "Ticket Resolution", "Project Work",
  "Training", "Meeting", "Documentation",
  "System Maintenance", "Bug Fix", "Feature Development", "Code Review"
];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  if (!d || isNaN(d.getTime())) return "—";
  return d.toISOString().split("T")[0];
}

export function TimesheetWeekly() {
  const { user, profile } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [timesheet, setTimesheet] = useState<any>(null);
  const [timeCards, setTimeCards] = useState<any[]>([]);
  const [tasks, setTasks] = useState<string[]>(DEFAULT_TASKS);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [form, setForm] = useState({ task: "", hours: "", description: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const monday = getMonday(new Date(Date.now() + weekOffset * 7 * 86400000));
  const weekStart = formatDate(monday);
  const weekEnd = formatDate(new Date(monday.getTime() + 6 * 86400000));

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86400000);
    return {
      date: formatDate(d),
      dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
      fullDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  const loadWeek = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get or create timesheet via API
      const tsRes = await fetch("/api/timesheets/get-or-create", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.uid,
          week_start: weekStart,
          week_end: weekEnd
        })
      });
      const ts = await tsRes.json();
      setTimesheet(ts);

      // Load time cards for this timesheet
      const tcRes = await fetch(`/api/time-cards?timesheet_id=${ts.id}`);
      const cards = await tcRes.json();
      setTimeCards(Array.isArray(cards) ? cards : []);
    } catch (e) {
      console.error(e);
      setTimeCards([]);
    }
    setLoading(false);
  }, [user, weekStart, weekEnd]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  async function saveEntry() {
    const mins = parseFloat(form.hours);
    const errs: string[] = [];
    if (!form.task) errs.push("Task is required");
    if (!mins || mins <= 0) errs.push("Minutes must be greater than 0");
    if (mins > 1440) errs.push("Minutes cannot exceed 1440");

    // Daily limit check (24 hours = 1440 minutes)
    const dayTotal = timeCards
      .filter(c => c.entry_date === selectedDate && c.id !== editEntry?.id)
      .reduce((sum, c) => sum + (parseFloat(c.hours_worked) || 0), 0);
    if (dayTotal + mins > 1440) errs.push(`Total minutes for this day would exceed 1440 (currently ${dayTotal} mins)`);

    if (errs.length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const data = {
        timesheet_id: timesheet.id,
        user_id: user!.uid,
        entry_date: selectedDate,
        task: form.task,
        hours_worked: mins,
        description: form.description,
        status: "Draft"
      };

      if (editEntry) {
        await fetch(`/api/time-cards/${editEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        await fetch("/api/time-cards", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      setShowModal(false);
      setEditEntry(null);
      setForm({ task: "", hours: "", description: "" });
      setErrors([]);
      loadWeek();
    } catch (e) { console.error(e); }
    setSaving(false);
  }

  async function deleteEntry(cardId: string) {
    if (!confirm("Delete this entry?")) return;
    try {
      await fetch(`/api/time-cards/${cardId}`, { method: 'DELETE' });
      loadWeek();
    } catch (e) { console.error(e); }
  }

  async function submitTimesheet() {
    if (!confirm("Submit this timesheet for approval? You won't be able to edit it after.")) return;
    if (timeCards.length === 0) { alert("Cannot submit an empty timesheet."); return; }
    try {
      const element = document.getElementById("timesheet-content");
      let screenshotUrl = "";
      if (element) {
        const canvas = await html2canvas(element, { scale: 1 });
        screenshotUrl = canvas.toDataURL("image/jpeg", 0.7);
      }

      await fetch(`/api/timesheets/${timesheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: "Submitted",
          screenshot_url: screenshotUrl,
          submitted_at: new Date().toISOString()
        })
      });
      loadWeek();
    } catch (e) { console.error(e); }
  }

  function openAdd(date: string) {
    setSelectedDate(date);
    setEditEntry(null);
    setForm({ task: "", hours: "", description: "" });
    setErrors([]);
    setShowModal(true);
  }

  function openEdit(card: any) {
    setSelectedDate(card.entry_date);
    setEditEntry(card);
    setForm({ task: card.task || "", hours: String(card.hours_worked || ""), description: card.description || "" });
    setErrors([]);
    setShowModal(true);
  }

  const canEdit = timesheet?.status === "Draft" || timesheet?.status === "Rejected";
  const weekTotal = timeCards.reduce((s, c) => s + (parseFloat(c.hours_worked) || 0), 0);

  return (
    <div id="timesheet-content" className="space-y-6 max-w-7xl mx-auto p-4 bg-background">
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-sn-green/10 rounded-xl">
            <Clock className="w-6 h-6 text-sn-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-sn-dark">My Tickets</h1>
            <p className="text-sm text-muted-foreground">Log your daily minutes</p>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-card p-2 rounded-lg border border-border">
          <div className="text-right px-4 border-r border-border">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Week Total</div>
            <div className="text-xl font-bold text-sn-green">{weekTotal.toFixed(0)} mins</div>
          </div>
          <span style={STATUS_COLORS[timesheet?.status] || STATUS_COLORS.Draft} className="px-3 py-1 rounded-full text-sm font-semibold">
            {timesheet?.status || "Draft"}
          </span>
          {canEdit && (
            <button onClick={submitTimesheet} className="flex items-center gap-2 bg-sn-green text-sn-dark px-4 py-2 rounded font-semibold text-sm hover:opacity-90 transition-opacity">
              <CheckCircle className="w-4 h-4" /> Submit Tickets
            </button>
          )}
        </div>
      </div>

      {/* Rejection banner */}
      {timesheet?.status === "Rejected" && timesheet?.rejectionReason && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Tickets Rejected</div>
            <div className="text-sm mt-1">{timesheet.rejectionReason}</div>
          </div>
        </div>
      )}

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekOffset(w => w - 1)} className="flex items-center gap-1 px-3 py-2 border border-border rounded text-sm hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" /> Previous Week
        </button>
        <div className="text-center">
          <div className="font-semibold">
            {new Date(weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} —{" "}
            {new Date(weekEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div className="text-sm text-muted-foreground">Total: <strong>{weekTotal.toFixed(0)}</strong> mins</div>
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="flex items-center gap-1 px-3 py-2 border border-border rounded text-sm hover:bg-muted transition-colors">
          Next Week <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* AI Tracker Banner */}
      {(() => {
        const aiEntries = timeCards.filter(c => (c.short_description || '').startsWith('[AI Tracked]'));
        const aiMins = aiEntries.reduce((s: number, c: any) => s + (parseFloat(c.hours_worked) || 0), 0);
        if (aiEntries.length === 0) return null;
        return (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Bot className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-blue-800">AI Activity Tracker</span>
              <span className="text-sm text-blue-600 ml-2">
                Auto-logged <strong>{aiMins} mins</strong> across <strong>{aiEntries.length}</strong> entries this week
              </span>
            </div>
            <Link to="/activity-tracker" className="text-xs text-blue-600 hover:underline font-medium flex-shrink-0">
              View tracker →
            </Link>
          </div>
        );
      })()}

      {/* Weekly Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-sn-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map(day => {
            const entries = timeCards.filter(c => c.entry_date === day.date);
            const dayTotal = entries.reduce((s, c) => s + (parseFloat(c.hours_worked) || 0), 0);
            const isWeekend = ["Sat", "Sun"].includes(day.dayName);
            return (
              <div key={day.date} className={`rounded-lg border border-border flex flex-col min-h-[280px] ${isWeekend ? "bg-muted/40" : "bg-card"}`}>
                <div className={`p-3 border-b border-border rounded-t-lg ${isWeekend ? "bg-muted/30" : "bg-muted/10"}`}>
                  <div className="text-xs font-bold uppercase text-muted-foreground">{day.dayName}</div>
                  <div className="text-base font-semibold">{day.fullDate}</div>
                  <div className="text-sm font-bold text-sn-green mt-1">{dayTotal.toFixed(0)} mins</div>
                </div>
                <div className="flex-grow p-2 space-y-1.5 overflow-y-auto max-h-[180px]">
                  {entries.length === 0 ? (
                    <div className="text-center py-4 text-xs text-muted-foreground italic">No entries</div>
                  ) : entries.map(entry => (
                    <div key={entry.id} className={`p-2 rounded border text-xs group relative hover:bg-muted/50 transition-colors
                      ${(entry.short_description || '').startsWith('[AI Tracked]')
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-muted/30 border-border'}`}>
                      <div className="font-semibold truncate pr-10 flex items-center gap-1">
                        {(entry.short_description || '').startsWith('[AI Tracked]') && (
                          <span title="Auto-tracked by AI Activity Tracker">🤖</span>
                        )}
                        {entry.task}
                      </div>
                      <div className="text-muted-foreground">{entry.hours_worked} mins</div>
                      {entry.short_description && (
                        <div className="text-muted-foreground truncate mt-0.5 text-[10px]">{entry.short_description}</div>
                      )}
                      {canEdit && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-0.5">
                          <button onClick={() => openEdit(entry)} className="p-1 hover:bg-white rounded" title="Edit">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => deleteEntry(entry.id)} className="p-1 hover:bg-red-100 text-red-500 rounded" title="Delete">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="p-2 border-t border-border">
                    <button onClick={() => openAdd(day.date)} className="w-full flex items-center justify-center gap-1 py-1.5 border border-border rounded text-xs hover:bg-muted transition-colors">
                      <Plus className="w-3 h-3" /> Add Entry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Week Total", value: `${weekTotal.toFixed(0)} mins`, color: "text-sn-dark" },
          { label: "Daily Average", value: `${(weekTotal / 7).toFixed(0)} mins`, color: "text-blue-600" },
          { label: "Entries", value: timeCards.length, color: "text-purple-600" },
          { label: "Status", value: timesheet?.status || "Draft", color: timesheet?.status === "Approved" ? "text-green-600" : timesheet?.status === "Rejected" ? "text-red-600" : "text-gray-700" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-lg border border-border p-4">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wide">{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-semibold">{editEntry ? "Edit Time Entry" : "Add Time Entry"}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-muted rounded">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Date</label>
                <input type="text" value={(() => {
                  if (!selectedDate) return "—";
                  const d = new Date(selectedDate + "T12:00:00");
                  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
                })()} disabled className="w-full p-2 bg-muted/30 border border-border rounded text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Task <span className="text-red-500">*</span></label>
                <select value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))} className="w-full p-2 border border-border rounded text-sm">
                  <option value="">Select a task...</option>
                  {tasks.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Minutes Worked <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="5"
                  value={form.hours}
                  onChange={e => setForm({ ...form, hours: e.target.value })}
                  className="w-full p-2.5 border border-border rounded-lg outline-none focus:ring-2 focus:ring-sn-green/20 focus:border-sn-green transition-all"
                  placeholder="Enter minutes (e.g. 30, 45, 60)"
                />
                <p className="text-xs text-muted-foreground mt-1">Max 1440 minutes per day total</p>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description / Notes</label>
                <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full p-2 border border-border rounded text-sm resize-none" placeholder="Describe the work done..." />
              </div>
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                  {errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-border">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-border rounded text-sm hover:bg-muted transition-colors">Cancel</button>
                <button onClick={saveEntry} disabled={saving} className="flex items-center gap-2 bg-sn-green text-sn-dark px-4 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                  {saving ? "Saving..." : "Save Entry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
