import React, { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { RefreshCw, LayoutGrid, Clock, AlertCircle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { cn, formatDate } from "../lib/utils";

function toMs(val: any): number {
  if (!val) return NaN;
  if (typeof val === 'object' && val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds || 0) / 1_000_000;
  if (typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val === 'number') return val;
  return new Date(val).getTime();
}

import { SLATimer } from "../components/SLATimer";
import { getEffectiveSlaDelayState } from "../lib/slaDelayUtils";

const PRIORITY_COLORS: Record<string, string> = {
  "1 - Critical": "#ef4444", // Neon Red
  "2 - High": "#f59e0b",     // Neon Amber
  "3 - Moderate": "#10b981", // Neon Emerald
  "4 - Low": "#06b6d4",      // Neon Cyan
};

export function Dashboard() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [users, setUsers] = useState<any[]>([]);
  const [layout, setLayout] = useState<'standard' | 'compact'>('standard');

  useEffect(() => {
    const unsubTickets = onSnapshot(query(collection(db, "tickets")), snap => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setLastRefresh(new Date());
    });
    const unsubUsers = onSnapshot(query(collection(db, "users")), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubTickets(); unsubUsers(); };
  }, []);

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;

  const getTs = (t: any) => {
    const c = t.createdAt;
    if (!c) return 0;
    if (c?.seconds) return c.seconds * 1000;
    if (typeof c === "string") return new Date(c).getTime();
    return 0;
  };

  const open = tickets.filter(t => !["Resolved", "Closed", "Canceled"].includes(t.status ?? ""));
  
  const criticalOpen = open.filter(t => (t.priority ?? "").includes("Critical")).length;
  const unassigned = open.filter(t => !t.assignedTo).length;
  const overdue = open.filter(t => t.resolutionDeadline && new Date(t.resolutionDeadline).getTime() < now).length;
  const openCount = open.length;
  const stale7 = open.filter(t => getTs(t) < sevenDaysAgo).length;
  const older30 = open.filter(t => getTs(t) < thirtyDaysAgo).length;

  const priorityGroups = ["1 - Critical", "2 - High", "3 - Moderate", "4 - Low"].map(p => ({
    name: p.replace(" - ", "\n"),
    label: p,
    count: open.filter(t => t.priority === p).length,
  }));

  const older30Groups = ["1 - Critical", "2 - High", "3 - Moderate", "4 - Low"].map(p => ({
    name: p.replace(" - ", "\n"),
    label: p,
    count: open.filter(t => t.priority === p && getTs(t) < thirtyDaysAgo).length,
  }));

  const recent = [...tickets]
    .sort((a, b) => getTs(b) - getTs(a))
    .slice(0, 8);

  const resolvedTickets = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed');
  const avgResTime = resolvedTickets.length > 0 
    ? resolvedTickets.reduce((acc, t) => {
        const start = getTs(t);
        const end = t.resolvedAt ? toMs(t.resolvedAt) : (t.updatedAt ? toMs(t.updatedAt) : start);
        return acc + (end - start);
      }, 0) / resolvedTickets.length / 3600000 
    : 0;

  const activeSLAs = open.filter(t => (t.responseSlaStatus === 'In Progress' || t.resolutionSlaStatus === 'In Progress')).length;
  const accountabilityStates = open.map((ticket) => ({ ticket, state: getEffectiveSlaDelayState(ticket) }));
  const above25Sla = accountabilityStates.filter(({ state }) => state.thresholdReached).length;
  const pendingJustification = accountabilityStates.filter(({ state }) => state.awaitingInitialJustification).length;
  const awaitingOwnerResponse = accountabilityStates.filter(({ state }) => state.awaitingOwnerResponse).length;
  const escalatedTickets = accountabilityStates.filter(({ state }) => state.meta.escalationLevel > 0).length;
  const breachedWithRca = accountabilityStates.filter(({ state }) => state.meta.breachAt || state.awaitingRca).length;
  const nearBreachSLAs = open.filter(t => {
    const respDeadline = t.responseDeadline ? new Date(t.responseDeadline).getTime() : Infinity;
    const resDeadline = t.resolutionDeadline ? new Date(t.resolutionDeadline).getTime() : Infinity;
    const now = Date.now();
    const isNear = (d: number) => d !== Infinity && (d - now) < (0.2 * (24 * 3600 * 1000));
    return isNear(respDeadline) || isNear(resDeadline);
  }).length;

  const completedCount = tickets.filter(t => t.responseSlaStatus === 'Completed').length + tickets.filter(t => t.resolutionSlaStatus === 'Completed').length;
  const breachedCount = tickets.filter(t => t.responseSlaStatus === 'Breached').length + tickets.filter(t => t.resolutionSlaStatus === 'Breached').length;
  const totalSLAs = tickets.length * 2;

  const slaStats = {
    active: activeSLAs,
    nearBreach: nearBreachSLAs,
    breached: breachedCount,
    completed: completedCount,
    total: totalSLAs,
    completedPct: totalSLAs > 0 ? Math.round((completedCount / totalSLAs) * 100) : 0,
    breachedPct: totalSLAs > 0 ? Math.round((breachedCount / totalSLAs) * 100) : 0,
    avgResTime: avgResTime.toFixed(1)
  };

  const statCards = [
    { label: "Critical Open Incidents", value: criticalOpen, color: "text-red-500 font-bold dark:text-red-400", link: "/tickets?filter=critical_open" },
    { label: "Unassigned Incidents", value: unassigned, color: "text-foreground dark:text-slate-300", link: "/tickets?filter=unassigned" },
    { label: "Overdue Incidents", value: overdue, color: "text-rose-600 font-black dark:text-rose-400", link: "/tickets?filter=overdue" },
    { label: "Open Incidents", value: openCount, color: "text-foreground dark:text-slate-300", link: "/tickets?filter=open" },
    { label: "Incidents not updated for 7 days", value: stale7, color: "text-foreground dark:text-slate-300", link: "/tickets?filter=stale_7" },
    { label: "Open Incidents older than 30 Days", value: older30, color: "text-foreground dark:text-slate-300", link: "/tickets?filter=older_30" },
    { label: "Tickets Above 25% SLA", value: above25Sla, color: "text-amber-600 font-bold dark:text-amber-400", link: "/tickets?filter=sla_25" },
    { label: "Pending Justifications", value: pendingJustification, color: "text-orange-600 font-bold dark:text-orange-400", link: "/tickets?filter=sla_justification" },
    { label: "Awaiting Owner Response", value: awaitingOwnerResponse, color: "text-yellow-600 font-bold dark:text-yellow-400", link: "/tickets?filter=sla_owner_response" },
    { label: "Escalated Tickets", value: escalatedTickets, color: "text-red-600 font-bold dark:text-red-400", link: "/tickets?filter=sla_escalated" },
    { label: "SLA Breached / RCA", value: breachedWithRca, color: "text-rose-600 font-black dark:text-rose-400", link: "/tickets?filter=sla_breached_rca" },
  ];
  return (
    <div className="space-y-6 max-w-7xl mx-auto font-outfit">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
            Security Control Center
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Real-time incident streams, executive indicators & global performance telemetry.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setLastRefresh(new Date())}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border/60 hover:border-cyan-500/30 rounded-xl text-xs font-bold bg-muted/20 hover:bg-white/5 dark:bg-white/5 transition-colors cursor-pointer text-foreground"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button 
            onClick={() => setLayout(prev => prev === 'standard' ? 'compact' : 'standard')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all cursor-pointer",
              layout === 'compact'
                ? "bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.15)]"
                : "border-border/60 hover:border-blue-500/30 hover:bg-white/5 text-foreground"
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            {layout === 'standard' ? 'Compact Layout' : 'Standard Layout'}
          </button>
          <span className="text-[10px] text-muted-foreground font-orbitron self-center">
            SYNC: {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className={cn("grid gap-6", layout === 'compact' ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1")}>
        <div className={cn(
          "glass-panel rounded-2xl border border-border/80 shadow-2xl overflow-hidden h-fit p-1 bg-card/60 backdrop-blur-md",
          layout === 'compact' ? "md:col-span-1" : "grid grid-cols-1"
        )}>
          <div className={cn("grid divide-border/40", layout === 'compact' ? "grid-cols-1 divide-y" : "grid-cols-3 divide-x")}>
            {statCards.slice(0, 3).map((s, i) => (
              <Link key={i} to={s.link} className={cn("p-6 text-center hover:bg-blue-500/5 transition-colors group", layout === 'compact' && "p-4")}>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2.5 font-outfit">{s.label}</div>
                <div className={cn("font-orbitron font-bold transition-transform inline-block", s.color, layout === 'compact' ? "text-3xl" : "text-4xl")}>
                  {loading ? "—" : s.value}
                </div>
              </Link>
            ))}
          </div>
          <div className={cn("grid divide-border/40 border-t border-border/40", layout === 'compact' ? "grid-cols-1 divide-y" : "grid-cols-3 divide-x")}>
            {statCards.slice(3, 6).map((s, i) => (
              <Link key={i} to={s.link} className={cn("p-6 text-center hover:bg-blue-500/5 transition-colors group", layout === 'compact' && "p-4")}>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2.5 font-outfit">{s.label}</div>
                <div className={cn("font-orbitron font-bold transition-transform inline-block", s.color, layout === 'compact' ? "text-3xl" : "text-4xl")}>
                  {loading ? "—" : s.value}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-2xl border border-border/80 p-5 shadow-2xl">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground font-outfit mb-4">SLA Accountability</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {statCards.slice(6).map((s, i) => (
              <Link key={`sla-card-${i}`} to={s.link} className="rounded-xl border border-border/60 bg-card/50 px-4 py-5 hover:bg-amber-500/5 transition-colors">
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">{s.label}</div>
                <div className={cn("font-orbitron font-bold text-3xl", s.color)}>{loading ? "—" : s.value}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className={cn("grid gap-6", layout === 'compact' ? "md:col-span-2 grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
          <div className="glass-panel rounded-2xl border border-border/80 p-5 h-full shadow-2xl">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground font-outfit mb-4">Open Incidents — Grouped by Priority</h3>
            <div className={cn("transition-all duration-500", layout === 'compact' ? "h-40" : "h-56")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityGroups} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.15)" />
                  <XAxis type="number" fontSize={9} allowDecimals={false} stroke="#94a3b8" style={{ fontFamily: "Orbitron, sans-serif" }} />
                  <YAxis type="category" dataKey="label" fontSize={9} width={90} stroke="#94a3b8" style={{ fontFamily: "Outfit, sans-serif" }} />
                  <Tooltip 
                    formatter={(v: any) => [v, "Tickets"]}
                    contentStyle={{
                      backgroundColor: "rgba(9, 10, 21, 0.85)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      fontSize: "11px",
                      color: "#ffffff",
                      fontFamily: "Outfit, sans-serif",
                      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
                    }}
                    itemStyle={{ color: "#ffffff" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {priorityGroups.map((entry, i) => (
                      <Cell key={i} fill={PRIORITY_COLORS[entry.label] || "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel rounded-2xl border border-border/80 p-5 h-full shadow-2xl">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground font-outfit mb-4">Open Incidents older than 30 Days</h3>
            <div className={cn("transition-all duration-500", layout === 'compact' ? "h-40" : "h-56")}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={older30Groups} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.15)" />
                  <XAxis type="number" fontSize={9} allowDecimals={false} stroke="#94a3b8" style={{ fontFamily: "Orbitron, sans-serif" }} />
                  <YAxis type="category" dataKey="label" fontSize={9} width={90} stroke="#94a3b8" style={{ fontFamily: "Outfit, sans-serif" }} />
                  <Tooltip 
                    formatter={(v: any) => [v, "Tickets"]}
                    contentStyle={{
                      backgroundColor: "rgba(9, 10, 21, 0.85)",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      fontSize: "11px",
                      color: "#ffffff",
                      fontFamily: "Outfit, sans-serif",
                      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
                    }}
                    itemStyle={{ color: "#ffffff" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {older30Groups.map((entry, i) => (
                      <Cell key={i} fill={PRIORITY_COLORS[entry.label] || "#64748b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced SLA Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total SLAs", value: slaStats.total, color: "text-slate-600 dark:text-slate-400", icon: Clock },
          { label: "SLA Completed %", value: `${slaStats.completedPct}%`, color: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
          { label: "Breached SLA %", value: `${slaStats.breachedPct}%`, color: "text-rose-600 dark:text-rose-400", icon: ShieldAlert },
          { label: "Avg Resolution", value: `${slaStats.avgResTime}h`, color: "text-blue-600 dark:text-blue-400", icon: Clock },
          { label: "Near Breach", value: slaStats.nearBreach, color: "text-amber-500 dark:text-amber-400", icon: AlertCircle }
        ].map((s, i) => (
          <div key={i} className="glass-panel border border-border/80 rounded-2xl p-4 shadow-xl flex items-center gap-4 group hover:border-cyan-500/30 transition-all hover:shadow-2xl">
            <div className="p-2.5 rounded-xl bg-muted/30 dark:bg-black/20 group-hover:bg-muted/50 dark:group-hover:bg-black/35 border border-border/30 dark:border-white/5 transition-colors">
              <s.icon className={cn("w-4 h-4", s.color)} />
            </div>
            <div>
              <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground font-outfit mb-1">{s.label}</div>
              <div className={cn("text-lg font-bold tracking-tight font-orbitron", s.color)}>{loading ? "—" : s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Incidents Table */}
      <div className="glass-panel rounded-2xl border border-border/80 shadow-2xl overflow-hidden bg-card/60 backdrop-blur-md">
        <div className="p-4 border-b border-border/40 flex items-center justify-between bg-muted/20 backdrop-blur-md">
          <h3 className="text-xs font-black uppercase tracking-wider text-foreground font-outfit">Operations Incident Feed</h3>
          <Link to="/tickets" className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline font-bold uppercase tracking-widest font-outfit">View All Incidents</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/10 border-b border-border/40 text-[9px] font-black uppercase text-muted-foreground tracking-widest">
                <th className="p-3">Number</th>
                <th className="p-3">Short Description</th>
                <th className="p-3">Priority</th>
                <th className="p-3">State</th>
                <th className="p-3">Category</th>
                <th className="p-3">Assigned To</th>
                <th className="p-3">SLA Status</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 font-outfit">
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">Fetching incident records...</td></tr>
              ) : recent.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">No incidents found.</td></tr>
              ) : recent.map(t => {
                const p = t.priority ?? "4 - Low";
                const priorityBadge = p.includes("Critical") ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                  p.includes("High") ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                    p.includes("Moderate") ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                      "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20";
                const isPaused = t.status === "On Hold" || t.status === "Waiting for Customer";

                return (
                  <tr key={t.id} className="hover:bg-blue-500/5 transition-colors">
                    <td className="p-3">
                      <Link to={`/tickets/${t.id}`} className="font-mono text-xs font-bold text-blue-500 dark:text-blue-400 hover:underline bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                        {t.number ?? t.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-3 text-xs font-medium max-w-[200px] truncate text-foreground/90">{t.title ?? "—"}</td>
                    <td className="p-3">
                      <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", priorityBadge)}>{p}</span>
                    </td>
                    <td className="p-3 text-xs font-semibold text-foreground/80">
                      {t.status ?? "New"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{t.incidentCategory || t.incident_category || t.category || "—"}</td>
                    <td className="p-3 text-xs font-medium">
                      {t.assignedToName || users.find(u => u.id === t.assignedTo)?.name || t.assignedTo || "Unassigned"}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1 bg-muted/20 dark:bg-black/10 p-1.5 rounded-lg border border-border/30 dark:border-white/5 max-w-[130px]">
                        <SLATimer
                          label="Resp"
                          deadline={t.responseDeadline}
                          metAt={t.firstResponseAt}
                          isPaused={isPaused}
                          onHoldStart={t.onHoldStart}
                          totalPausedTime={t.totalPausedTime}
                        />
                        <SLATimer
                          label="Res"
                          deadline={t.resolutionDeadline}
                          metAt={t.resolvedAt}
                          isPaused={isPaused}
                          onHoldStart={t.onHoldStart}
                          totalPausedTime={t.totalPausedTime}
                          waitUntil={t.firstResponseAt ?? null}
                        />
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground font-mono">
                      {formatDate(t.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
