import React, { useState, useEffect, useCallback } from "react";
import {
  Mail, CheckCircle, XCircle, RefreshCw, Send, Inbox,
  AlertTriangle, Clock, Activity, Shield, Wifi, WifiOff,
  ArrowDownToLine, ArrowUpFromLine, Eye, Play, RotateCcw,
  Server, Database, Zap, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface M365Health {
  status: "healthy" | "degraded" | "unreachable";
  smtp:  { connected: boolean; host: string; port: number };
  imap:  { connected: boolean; host: string; port: number };
  stats: { sent_24h: number; received_24h: number; failed_24h: number };
  lastPollTime: string | null;
  queuePending: number;
  queueFailed:  number;
}

interface M365Stats {
  emails_received_today: number;
  emails_sent_today:     number;
  failed_emails_today:   number;
  queue_pending:         number;
  queue_failed:          number;
  queue_sent:            number;
}

interface AuditLog {
  id:           number;
  event_type:   string;
  direction:    string;
  status:       string;
  ticket_number?: string;
  sender?:      string;
  recipient?:   string;
  subject?:     string;
  error_msg?:   string;
  created_at:   string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function M365EmailMonitor() {
  const { profile } = useAuth();

  const [health, setHealth]       = useState<M365Health | null>(null);
  const [stats, setStats]         = useState<M365Stats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [config, setConfig]       = useState<any>(null);

  const [loadingHealth, setLoadingHealth] = useState(false);
  const [testingSmtp,   setTestingSmtp]   = useState(false);
  const [testingImap,   setTestingImap]   = useState(false);
  const [sendingTest,   setSendingTest]   = useState(false);
  const [polling,       setPolling]       = useState(false);

  const [smtpResult, setSmtpResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [imapResult, setImapResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pollResult, setPollResult] = useState<string | null>(null);

  const [testEmail,  setTestEmail]  = useState("");
  const [expandLogs, setExpandLogs] = useState(false);
  const [logFilter,  setLogFilter]  = useState<"all" | "inbound" | "outbound" | "failed">("all");

  // ── Access guard ─────────────────────────────────────────────────────────────
  const isAdmin = ["admin", "super_admin", "ultra_super_admin"].includes(profile?.role || "");

  // ── Data fetchers ─────────────────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setLoadingHealth(true);
    try {
      const r = await fetch("/api/m365/health");
      if (r.ok) setHealth(await r.json());
    } catch { /* silent */ }
    setLoadingHealth(false);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/m365/stats");
      if (r.ok) setStats(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const r = await fetch("/api/m365/audit-logs?limit=100");
      if (r.ok) setAuditLogs(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchEmailLogs = useCallback(async () => {
    try {
      const r = await fetch("/api/email/logs?limit=50");
      if (r.ok) setEmailLogs(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const r = await fetch("/api/m365/config");
      if (r.ok) setConfig(await r.json());
    } catch { /* silent */ }
  }, []);

  const refreshAll = useCallback(() => {
    fetchHealth();
    fetchStats();
    fetchAuditLogs();
    fetchEmailLogs();
    fetchConfig();
  }, [fetchHealth, fetchStats, fetchAuditLogs, fetchEmailLogs, fetchConfig]);

  useEffect(() => {
    if (isAdmin) refreshAll();
  }, [isAdmin, refreshAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(refreshAll, 30_000);
    return () => clearInterval(t);
  }, [isAdmin, refreshAll]);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleTestSmtp = async () => {
    setTestingSmtp(true); setSmtpResult(null);
    try {
      const r = await fetch("/api/m365/test-smtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setSmtpResult(await r.json());
    } catch (e: any) { setSmtpResult({ ok: false, msg: e.message }); }
    setTestingSmtp(false);
  };

  const handleTestImap = async () => {
    setTestingImap(true); setImapResult(null);
    try {
      const r = await fetch("/api/m365/test-imap", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setImapResult(await r.json());
    } catch (e: any) { setImapResult({ ok: false, msg: e.message }); }
    setTestingImap(false);
  };

  const handleSendTest = async () => {
    setSendingTest(true); setSendResult(null);
    try {
      const r = await fetch("/api/m365/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail || undefined }),
      });
      const d = await r.json();
      setSendResult({ ok: d.ok ?? r.ok, msg: d.messageId ? `Sent (ID: ${d.messageId})` : (d.error || d.msg || "Done") });
    } catch (e: any) { setSendResult({ ok: false, msg: e.message }); }
    setSendingTest(false);
  };

  const handlePollNow = async () => {
    setPolling(true); setPollResult(null);
    try {
      const r = await fetch("/api/m365/poll-now", { method: "POST" });
      const d = await r.json();
      setPollResult(d.message || "Poll triggered.");
      setTimeout(() => { fetchAuditLogs(); fetchStats(); fetchEmailLogs(); }, 3000);
    } catch (e: any) { setPollResult(`Error: ${e.message}`); }
    setPolling(false);
  };

  // ── Filtered logs ─────────────────────────────────────────────────────────────
  const filteredLogs = auditLogs.filter(l => {
    if (logFilter === "all")      return true;
    if (logFilter === "failed")   return l.status === "failed";
    if (logFilter === "inbound")  return l.direction === "inbound";
    if (logFilter === "outbound") return l.direction === "outbound";
    return true;
  });

  // ── Guard ─────────────────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto opacity-30" />
          <h2 className="text-2xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground">Administrator access required to view the M365 Email Monitor.</p>
        </div>
      </div>
    );
  }

  // ── Status helpers ────────────────────────────────────────────────────────────
  const statusColor = (s: string) =>
    s === "healthy"   ? "text-green-500" :
    s === "degraded"  ? "text-yellow-500" :
    s === "success"   ? "text-green-500" :
    s === "sent"      ? "text-green-500" :
    s === "failed"    ? "text-red-500" :
    s === "unreachable" ? "text-red-500" : "text-muted-foreground";

  const statusBg = (s: string) =>
    s === "healthy" || s === "success" || s === "sent"
      ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }
      : s === "degraded"
      ? { backgroundColor: "rgba(234,179,8,0.12)", color: "#facc15", border: "1px solid rgba(234,179,8,0.3)" }
      : s === "failed" || s === "unreachable"
      ? { backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }
      : { backgroundColor: "rgba(100,116,139,0.12)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.2)" };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,120,212,0.15)" }}>
            <Mail className="w-5 h-5" style={{ color: "#0078d4" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Microsoft 365 Email Monitor</h1>
            <p className="text-sm text-muted-foreground">
              support@technosprint.net — outlook.office365.com · smtp.office365.com
            </p>
          </div>
        </div>
        <button
          onClick={() => { refreshAll(); }}
          disabled={loadingHealth}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loadingHealth ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Connection Status Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Overall Health */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase font-bold mb-2">Mailbox Health</div>
          <div className="flex items-center gap-2">
            {health?.status === "healthy" ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : health?.status === "degraded" ? (
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
            <span className={`text-lg font-bold capitalize ${statusColor(health?.status || "")}`}>
              {health?.status ?? "—"}
            </span>
          </div>
        </div>

        {/* SMTP */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase font-bold mb-2 flex items-center gap-1.5">
            <Send className="w-3 h-3" /> SMTP (587)
          </div>
          <div className="flex items-center gap-2">
            {health?.smtp.connected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <span className={`text-sm font-semibold ${health?.smtp.connected ? "text-green-500" : "text-red-500"}`}>
              {health?.smtp.connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">smtp.office365.com</div>
        </div>

        {/* IMAP */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase font-bold mb-2 flex items-center gap-1.5">
            <Inbox className="w-3 h-3" /> IMAP (993)
          </div>
          <div className="flex items-center gap-2">
            {health?.imap.connected ? (
              <Wifi className="w-5 h-5 text-green-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-500" />
            )}
            <span className={`text-sm font-semibold ${health?.imap.connected ? "text-green-500" : "text-red-500"}`}>
              {health?.imap.connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">outlook.office365.com</div>
        </div>

        {/* Last Sync */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase font-bold mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Last Sync
          </div>
          <div className="text-sm font-semibold">
            {health?.lastPollTime
              ? new Date(health.lastPollTime).toLocaleTimeString()
              : "Never"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {health?.lastPollTime
              ? new Date(health.lastPollTime).toLocaleDateString()
              : "IMAP not polled yet"}
          </div>
        </div>
      </div>

      {/* ── Email Activity Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Received Today",  value: stats?.emails_received_today ?? health?.stats.received_24h ?? 0, icon: ArrowDownToLine, color: "text-blue-400" },
          { label: "Sent Today",      value: stats?.emails_sent_today     ?? health?.stats.sent_24h     ?? 0, icon: ArrowUpFromLine, color: "text-green-400" },
          { label: "Failed Emails",   value: stats?.failed_emails_today   ?? health?.stats.failed_24h   ?? 0, icon: AlertTriangle,   color: "text-red-400" },
          { label: "Queue Pending",   value: stats?.queue_pending ?? health?.queuePending ?? 0,              icon: Clock,           color: "text-yellow-400" },
          { label: "Queue Failed",    value: stats?.queue_failed  ?? health?.queueFailed  ?? 0,              icon: XCircle,         color: "text-red-400" },
          { label: "Queue Sent",      value: stats?.queue_sent    ?? 0,                                      icon: CheckCircle,     color: "text-green-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3">
            <s.icon className={`w-4 h-4 ${s.color} mb-1`} />
            <div className="text-xl font-bold">{s.value}</div>
            <div className="text-[10px] text-muted-foreground uppercase font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Configuration Info ────────────────────────────────────────────── */}
      {config && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2 bg-muted/20">
            <Server className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Active M365 Configuration</span>
            {config.config && (
              <span
                style={statusBg(config.config.is_active ? "healthy" : "failed")}
                className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
              >
                {config.config.is_active ? "Active" : "Inactive"}
              </span>
            )}
            {config.config?.is_default ? (
              <span style={statusBg("sent")} className="text-[10px] font-bold px-2 py-0.5 rounded-full">Default</span>
            ) : null}
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: "Mailbox",         value: config.defaults.email_address },
              { label: "SMTP Host",       value: `${config.defaults.smtp_host}:${config.defaults.smtp_port}` },
              { label: "SMTP Encryption", value: config.defaults.smtp_encryption },
              { label: "IMAP Host",       value: `${config.defaults.imap_host}:${config.defaults.imap_port}` },
              { label: "IMAP Encryption", value: config.defaults.imap_encryption },
              { label: "DB Config ID",    value: config.config?.id ?? "Not seeded" },
              { label: "Last Updated",    value: config.config?.updated_at ? new Date(config.config.updated_at).toLocaleString() : "—" },
              { label: "Provider",        value: "Microsoft 365" },
            ].map(r => (
              <div key={r.label}>
                <div className="text-[10px] text-muted-foreground uppercase font-bold">{r.label}</div>
                <div className="font-medium mt-0.5">{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Connection Tests ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* SMTP Test */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Test SMTP Connection</span>
          </div>
          <p className="text-xs text-muted-foreground">Verify outbound mail via smtp.office365.com:587 (STARTTLS).</p>
          <button
            onClick={handleTestSmtp}
            disabled={testingSmtp}
            className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            {testingSmtp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {testingSmtp ? "Testing…" : "Test SMTP"}
          </button>
          {smtpResult && (
            <div
              style={statusBg(smtpResult.ok ? "success" : "failed")}
              className="text-xs p-2 rounded-lg"
            >
              {smtpResult.ok ? "✓" : "✗"} {smtpResult.msg}
            </div>
          )}
        </div>

        {/* IMAP Test */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Test IMAP Connection</span>
          </div>
          <p className="text-xs text-muted-foreground">Verify inbound polling via outlook.office365.com:993 (SSL/TLS).</p>
          <button
            onClick={handleTestImap}
            disabled={testingImap}
            className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            {testingImap ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
            {testingImap ? "Testing…" : "Test IMAP"}
          </button>
          {imapResult && (
            <div
              style={statusBg(imapResult.ok ? "success" : "failed")}
              className="text-xs p-2 rounded-lg"
            >
              {imapResult.ok ? "✓" : "✗"} {imapResult.msg}
            </div>
          )}
        </div>

        {/* Send Test Email */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Send Test Email</span>
          </div>
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="recipient@example.com (optional)"
            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSendTest}
            disabled={sendingTest}
            className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            {sendingTest ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sendingTest ? "Sending…" : "Send Test Email"}
          </button>
          {sendResult && (
            <div
              style={statusBg(sendResult.ok ? "success" : "failed")}
              className="text-xs p-2 rounded-lg"
            >
              {sendResult.ok ? "✓" : "✗"} {sendResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* ── Manual Poll & Queue ───────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Zap className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="font-semibold text-sm">Manual IMAP Poll</div>
            <div className="text-xs text-muted-foreground">
              Trigger an immediate inbox check. Auto-polls every 1 minute in background.
            </div>
          </div>
        </div>
        <button
          onClick={handlePollNow}
          disabled={polling}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {polling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {polling ? "Polling…" : "Poll Inbox Now"}
        </button>
        {pollResult && (
          <div className="text-xs text-muted-foreground md:ml-2">{pollResult}</div>
        )}
      </div>

      {/* ── Audit & Email Logs ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandLogs(!expandLogs)}
          className="w-full p-4 border-b border-border flex items-center justify-between hover:bg-muted/20 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Email Activity Logs</span>
            <span className="text-xs text-muted-foreground">({auditLogs.length} M365 events)</span>
          </div>
          {expandLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expandLogs && (
          <>
            {/* Filter tabs */}
            <div className="flex gap-1 p-3 border-b border-border">
              {(["all", "inbound", "outbound", "failed"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setLogFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors capitalize ${
                    logFilter === f
                      ? "bg-blue-600 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground self-center">{filteredLogs.length} records</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                    <th className="p-3">Time</th>
                    <th className="p-3">Event</th>
                    <th className="p-3">Direction</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Ticket</th>
                    <th className="p-3">From / To</th>
                    <th className="p-3">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">
                        No audit events yet. Run a connection test or send a test email to start logging.
                      </td>
                    </tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="p-3 text-xs font-medium">{log.event_type.replace(/_/g, " ")}</td>
                      <td className="p-3">
                        <span style={statusBg(log.direction === "inbound" ? "sent" : "degraded")}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">
                          {log.direction}
                        </span>
                      </td>
                      <td className="p-3">
                        <span style={statusBg(log.status)}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">
                          {log.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-mono">{log.ticket_number ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-[160px]">
                        {log.direction === "inbound" ? log.sender : log.recipient ?? "—"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground truncate max-w-[200px]">
                        {log.subject ?? (log.error_msg ? `⚠ ${log.error_msg}` : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Recent Email Logs (from email_logs table) ──────────────────────── */}
      {emailLogs.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2 bg-muted/20">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Recent Email Activity (All Providers)</span>
            <span className="text-xs text-muted-foreground ml-1">({emailLogs.length} records)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/30 border-b border-border text-[10px] font-bold uppercase text-muted-foreground">
                  <th className="p-3">Time</th>
                  <th className="p-3">Direction</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Ticket</th>
                  <th className="p-3">Recipient / Sender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {emailLogs.slice(0, 20).map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/10 transition-colors">
                    <td className="p-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-3">
                      <span style={statusBg(log.direction === "inbound" ? "sent" : "degraded")}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">
                        {log.direction}
                      </span>
                    </td>
                    <td className="p-3 text-xs capitalize">{log.email_type?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="p-3">
                      <span style={statusBg(log.status)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">
                        {log.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-mono">{log.ticket_number ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground truncate max-w-[200px]">
                      {log.direction === "inbound" ? log.sender : log.recipient ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Info Banner ───────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">Incoming mail</strong> is polled every 60 seconds via IMAP from <strong>outlook.office365.com:993</strong> (SSL/TLS).</p>
          <p><strong className="text-foreground">Outgoing mail</strong> is dispatched via <strong>smtp.office365.com:587</strong> (STARTTLS) through the enterprise email queue.</p>
          <p><strong className="text-foreground">Two-way threading</strong> is active — replies with <code>[INCxxxxxxx]</code> in the subject are linked to the existing ticket automatically.</p>
          <p><strong className="text-foreground">Credentials</strong> are stored in environment variables (<code>M365_SMTP_PASS</code>, <code>M365_IMAP_PASS</code>) and never exposed to the frontend.</p>
        </div>
      </div>

    </div>
  );
}
