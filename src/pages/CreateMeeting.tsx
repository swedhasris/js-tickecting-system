import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  Plus, Search, Calendar, Clock, Users, FileText, Copy, Check,
  Edit3, Trash2, X, ChevronRight, AlertCircle, CheckCircle2,
  RefreshCw, Eye, Share2, Video, MapPin, Wifi, Radio,
  ClipboardList, MessageSquare, Paperclip, UserCheck, UserX,
  PlayCircle, XCircle, MoreHorizontal, LogIn, Filter,
  ArrowLeft, Download, Bell, ChevronDown, ChevronUp,
  Flag, Building2, Globe, Zap, Shield, Star, Layers,
  Timer, Film, UploadCloud, Users2, Activity, Hash,
  Link2, Send, BookOpen, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────────────────

type MeetingType = "Internal" | "External";
type MeetingPriority = "Critical" | "High" | "Medium" | "Low";
type MeetingStatus = "Scheduled" | "In Progress" | "Completed" | "Cancelled" | "Postponed";

interface Participant {
  id: string;
  name: string;
  email: string;
  role: "Organizer" | "Co-host" | "Attendee" | "Optional";
  status: "Invited" | "Confirmed" | "Declined" | "Attended" | "No-show";
  joinTime?: string;
  leaveTime?: string;
}

interface Attachment {
  id: string;
  name: string;
  size: number;
  type: "attachment" | "agenda" | "mom" | "notes";
  url: string;
  uploadedAt: string;
  uploadedBy: string;
}

interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

interface TimelineEvent {
  key: string;
  label: string;
  timestamp: string;
  performedBy?: string;
}

interface Meeting {
  id: string;          // internal UUID key
  meetingId: string;   // CM-XXXXXX display ID
  roomId: string;      // ROOM-XXXX-XXXX
  meetingUrl: string;  // internal URL

  title: string;
  description: string;
  meetingDate: string;
  meetingTime: string;
  duration: string;    // e.g. "60 minutes"
  organizer: string;
  meetingType: MeetingType;
  priority: MeetingPriority;
  status: MeetingStatus;

  participants: Participant[];
  attachments: Attachment[];
  comments: Comment[];
  timeline: TimelineEvent[];
  notes: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isTsMeeting?: boolean;
  tsmId?: string;
  tsPassword?: string;
  recurrence?: string;
  ticketId?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "cm_meetings_v1";

const DURATION_OPTIONS = [
  "15 minutes", "30 minutes", "45 minutes", "1 hour",
  "1.5 hours", "2 hours", "3 hours", "4 hours", "All Day"
];

const STATUS_COLORS: Record<MeetingStatus, string> = {
  Scheduled:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "In Progress":"bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Completed:   "bg-green-500/10 text-green-400 border-green-500/20",
  Cancelled:   "bg-red-500/10 text-red-400 border-red-500/20",
  Postponed:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const PRIORITY_COLORS: Record<MeetingPriority, string> = {
  Critical: "bg-red-500/10 text-red-400 border-red-500/20",
  High:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Medium:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Low:      "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function genUUID(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function genMeetingId(): string {
  return `CM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function genRoomId(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ROOM-${seg()}-${seg()}`;
}

function genMeetingUrl(roomId: string): string {
  return `${window.location.origin}/meet/${roomId.toLowerCase()}`;
}

const mapDBToMeeting = (r: any): Meeting => {
  const isTs = r.tsm_id ? r.tsm_id.startsWith('TSM-') : false;
  return {
    id: r.tsm_id,
    meetingId: r.tsm_id,
    roomId: r.room_id || '',
    meetingUrl: isTs ? `${window.location.origin}/ts-meeting/${r.tsm_id}/lobby` : genMeetingUrl(r.room_id || ''),
    title: r.title,
    description: r.description || '',
    meetingDate: r.meeting_date || '',
    meetingTime: r.meeting_time || '',
    duration: r.duration || '',
    organizer: r.organizer || '',
    meetingType: (r.meeting_type || 'Internal') as MeetingType,
    priority: (r.priority || 'Medium') as MeetingPriority,
    status: (r.status || 'Scheduled') as MeetingStatus,
    participants: Array.isArray(r.participants) ? r.participants : [],
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
    comments: Array.isArray(r.comments) ? r.comments : [],
    timeline: Array.isArray(r.timeline) ? r.timeline : [],
    notes: r.notes || '',
    createdBy: r.organizer || '',
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    isTsMeeting: isTs,
    tsmId: r.tsm_id,
    tsPassword: r.password || '',
    recurrence: r.recurrence || 'None',
    ticketId: r.ticket_id || '',
  };
};

// ── Main Component ────────────────────────────────────────────────────────────

export function CreateMeeting() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const currentUserName = profile?.name || user?.email || "System";

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MeetingStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<MeetingType | "">("");
  const [priorityFilter, setPriorityFilter] = useState<MeetingPriority | "">("");

  // Views
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "participants" | "timeline" | "attachments" | "activity" | "tsmeeting">("info");

  // TS Meeting detail states
  const [tsAttendance, setTsAttendance] = useState<any[]>([]);
  const [tsChat, setTsChat] = useState<any[]>([]);
  const [loadingTsData, setLoadingTsData] = useState(false);

  const fetchTSMeetings = async () => {
    try {
      const res = await fetch("/api/ts-meetings");
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.map(mapDBToMeeting));
      }
    } catch (err) {
      console.error("Error fetching TS meetings:", err);
    }
  };

  useEffect(() => {
    fetchTSMeetings();
  }, []);

  useEffect(() => {
    if (detailTab === "tsmeeting" && selectedMeeting?.tsmId) {
      setLoadingTsData(true);
      Promise.all([
        fetch(`/api/ts-meetings/${selectedMeeting.tsmId}/attendance`).then(r => r.json()),
        fetch(`/api/ts-meetings/${selectedMeeting.tsmId}/chat`).then(r => r.json())
      ]).then(([attData, chatData]) => {
        if (attData.success) setTsAttendance(attData.attendance || []);
        if (chatData.success) setTsChat(chatData.chat || []);
      }).catch(err => console.error("Error fetching TS Meeting stats:", err))
        .finally(() => setLoadingTsData(false));
    }
  }, [detailTab, selectedMeeting]);

  // Copy feedback
  const [copied, setCopied] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  // ── Form state (create / edit) ──────────────────────────────────────────────
  const emptyForm = () => ({
    title: "",
    description: "",
    meetingDate: new Date().toISOString().slice(0, 10),
    meetingTime: "10:00",
    duration: "1 hour",
    organizer: currentUserName,
    meetingType: "Internal" as MeetingType,
    priority: "Medium" as MeetingPriority,
    status: "Scheduled" as MeetingStatus,
    newParticipantName: "",
    newParticipantEmail: "",
    newParticipantRole: "Attendee" as Participant["role"],
    participants: [] as Participant[],
    notes: "",
    newComment: "",
    isTsMeeting: false,
    tsmId: "",
    tsPassword: "",
    recurrence: "None",
    ticketId: "",
  });

  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Attachment upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachType, setAttachType] = useState<Attachment["type"]>("attachment");

  // ── Derived filtered list ───────────────────────────────────────────────────
  const filtered = meetings.filter(m => {
    const q = searchQuery.toLowerCase();
    const matchQ = !q || m.title.toLowerCase().includes(q) || m.meetingId.toLowerCase().includes(q) || m.organizer.toLowerCase().includes(q);
    const matchStatus = !statusFilter || m.status === statusFilter;
    const matchType = !typeFilter || m.meetingType === typeFilter;
    const matchPriority = !priorityFilter || m.priority === priorityFilter;
    return matchQ && matchStatus && matchType && matchPriority;
  });

  const stats = {
    total: meetings.length,
    scheduled: meetings.filter(m => m.status === "Scheduled").length,
    inProgress: meetings.filter(m => m.status === "In Progress").length,
    completed: meetings.filter(m => m.status === "Completed").length,
    cancelled: meetings.filter(m => m.status === "Cancelled").length,
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setForm(emptyForm());
    setFormError("");
    setEditingMeeting(null);
    setView("create");
  };

  const handleCreateInstantMeeting = async () => {
    try {
      const now = new Date();
      const tsm_id = `TSM-${Math.floor(100000 + Math.random() * 900000)}`;
      const room_id = `ROOM-${tsm_id.split("-")[1]}-TSME`;
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 5);

      const reqBody = {
        tsm_id,
        title: `Instant Meeting by ${currentUserName}`,
        description: "Quick ad-hoc internal conference call",
        meeting_date: dateStr,
        meeting_time: timeStr,
        duration: "1 hour",
        organizer: currentUserName,
        participants: [],
        meeting_type: "Internal",
        priority: "Medium",
        status: "In Progress",
        room_id,
        password: "",
        notes: "",
        attachments: [],
        comments: [],
        timeline: [{ key: genUUID(), label: "Instant Meeting Created", timestamp: now.toISOString(), performedBy: currentUserName }],
        recurrence: "None",
        ticket_id: null
      };

      const res = await fetch("/api/ts-meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });

      if (!res.ok) {
        throw new Error("Failed to create instant meeting");
      }

      await fetchTSMeetings();
      navigate(`/ts-meeting/${tsm_id}/lobby`);
    } catch (err: any) {
      alert(err.message || "Failed to start instant meeting");
    }
  };

  const openEdit = (m: Meeting) => {
    setEditingMeeting(m);
    setForm({
      ...emptyForm(),
      title: m.title,
      description: m.description,
      meetingDate: m.meetingDate,
      meetingTime: m.meetingTime,
      duration: m.duration,
      organizer: m.organizer,
      meetingType: m.meetingType,
      priority: m.priority,
      status: m.status,
      participants: [...m.participants],
      notes: m.notes,
      isTsMeeting: m.isTsMeeting || false,
      tsmId: m.tsmId || "",
      tsPassword: m.tsPassword || "",
      recurrence: m.recurrence || "None",
      ticketId: m.ticketId || "",
    });
    setFormError("");
    setView("create");
  };

  const openDetail = (m: Meeting) => {
    setSelectedMeeting(m);
    setDetailTab("info");
    setView("detail");
  };

  const handleAddParticipant = () => {
    if (!form.newParticipantName.trim()) return;
    const p: Participant = {
      id: genUUID(),
      name: form.newParticipantName.trim(),
      email: form.newParticipantEmail.trim(),
      role: form.newParticipantRole,
      status: "Invited",
    };
    setForm(prev => ({ ...prev, participants: [...prev.participants, p], newParticipantName: "", newParticipantEmail: "" }));
  };

  const handleRemoveParticipant = (id: string) => {
    setForm(prev => ({ ...prev, participants: prev.participants.filter(p => p.id !== id) }));
  };

  const updateTSMeetingOnBackend = async (updated: Meeting) => {
    try {
      const res = await fetch(`/api/ts-meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tsm_id: updated.tsmId,
          title: updated.title,
          description: updated.description,
          meeting_date: updated.meetingDate,
          meeting_time: updated.meetingTime,
          duration: updated.duration,
          organizer: updated.organizer,
          participants: updated.participants,
          meeting_type: updated.meetingType,
          priority: updated.priority,
          status: updated.status,
          room_id: updated.roomId,
          password: updated.tsPassword,
          notes: updated.notes,
          attachments: updated.attachments,
          comments: updated.comments,
          timeline: updated.timeline,
          recurrence: updated.recurrence,
          ticket_id: updated.ticketId
        })
      });
      if (res.ok) {
        await fetchTSMeetings();
      }
    } catch (err) {
      console.error("Failed to update TS meeting on backend:", err);
    }
  };

  const handleSaveMeeting = async () => {
    setFormError("");
    if (!form.title.trim()) { setFormError("Meeting Title is required."); return; }
    if (!form.meetingDate) { setFormError("Meeting Date is required."); return; }
    if (!form.meetingTime) { setFormError("Meeting Time is required."); return; }
    if (!form.organizer.trim()) { setFormError("Meeting Organizer is required."); return; }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const tsm_id = editingMeeting ? editingMeeting.tsmId : (form.isTsMeeting ? form.tsmId : `CM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
      const room_id = editingMeeting ? editingMeeting.roomId : (form.isTsMeeting ? `ROOM-${tsm_id.split("-")[1]}-TSME` : genRoomId());
      const password = form.isTsMeeting ? form.tsPassword : "";

      const timeline: TimelineEvent[] = editingMeeting 
        ? [...editingMeeting.timeline, { key: genUUID(), label: "Meeting Updated", timestamp: now, performedBy: currentUserName }]
        : [{ key: genUUID(), label: "Meeting Created", timestamp: now, performedBy: currentUserName }];

      const reqBody = {
        tsm_id,
        title: form.title,
        description: form.description,
        meeting_date: form.meetingDate,
        meeting_time: form.meetingTime,
        duration: form.duration,
        organizer: form.organizer,
        participants: form.participants,
        meeting_type: form.meetingType,
        priority: form.priority,
        status: form.status,
        room_id,
        password,
        notes: form.notes,
        attachments: editingMeeting ? editingMeeting.attachments : [],
        comments: editingMeeting ? editingMeeting.comments : [],
        timeline,
        recurrence: form.recurrence,
        ticket_id: form.ticketId
      };

      const res = await fetch("/api/ts-meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save meeting");
      }

      await fetchTSMeetings();
      setView("list");
    } catch (err: any) {
      setFormError(err.message || "Failed to save meeting.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMeeting = async (m: Meeting) => {
    if (!window.confirm(`Cancel meeting "${m.title}"?`)) return;
    try {
      const res = await fetch(`/api/ts-meetings/${m.tsmId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Cancelled" })
      });
      if (res.ok) {
        await fetchTSMeetings();
        if (selectedMeeting?.tsmId === m.tsmId) {
          setSelectedMeeting(prev => prev ? { ...prev, status: "Cancelled" } : null);
        }
      }
    } catch (err) {
      console.error("Error cancelling meeting:", err);
    }
  };

  const handleCompleteMeeting = async (m: Meeting) => {
    if (!window.confirm(`Mark meeting "${m.title}" as Completed?`)) return;
    try {
      const res = await fetch(`/api/ts-meetings/${m.tsmId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" })
      });
      if (res.ok) {
        await fetchTSMeetings();
        if (selectedMeeting?.tsmId === m.tsmId) {
          setSelectedMeeting(prev => prev ? { ...prev, status: "Completed" } : null);
        }
      }
    } catch (err) {
      console.error("Error completing meeting:", err);
    }
  };

  const handleDeleteMeeting = async (m: Meeting) => {
    if (!window.confirm(`Permanently delete meeting "${m.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/ts-meetings/${m.tsmId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchTSMeetings();
        if (selectedMeeting?.tsmId === m.tsmId) {
          setSelectedMeeting(null);
          setView("list");
        }
      }
    } catch (err) {
      console.error("Error deleting meeting:", err);
    }
  };

  const handleCopyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); } catch { /* */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = (m: Meeting) => {
    const text = `📅 ${m.title}\n🗓 ${m.meetingDate} at ${m.meetingTime}\n👤 Organizer: ${m.organizer}\n🔗 Join: ${m.meetingUrl}\n🏠 Room: ${m.roomId}`;
    try { navigator.clipboard.writeText(text); } catch { /* */ }
    setShareMsg("Meeting details copied to clipboard!");
    setTimeout(() => setShareMsg(""), 2500);
  };

  const handleFileUpload = async (file: File, type: Attachment["type"]) => {
    if (!selectedMeeting) return;
    const url = URL.createObjectURL(file);
    const att: Attachment = {
      id: genUUID(),
      name: file.name,
      size: file.size,
      type,
      url,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentUserName,
    };
    const now = new Date().toISOString();
    const updated: Meeting = {
      ...selectedMeeting,
      attachments: [...selectedMeeting.attachments, att],
      updatedAt: now,
      timeline: [...selectedMeeting.timeline, { key: genUUID(), label: `${type.charAt(0).toUpperCase() + type.slice(1)} uploaded: ${file.name}`, timestamp: now, performedBy: currentUserName }],
    };
    setSelectedMeeting(updated);
    await updateTSMeetingOnBackend(updated);
  };

  const handleAddComment = async () => {
    if (!form.newComment.trim() || !selectedMeeting) return;
    const now = new Date().toISOString();
    const c: Comment = { id: genUUID(), author: currentUserName, text: form.newComment.trim(), createdAt: now };
    const updated: Meeting = {
      ...selectedMeeting,
      comments: [...selectedMeeting.comments, c],
      updatedAt: now,
    };
    setSelectedMeeting(updated);
    setForm(prev => ({ ...prev, newComment: "" }));
    await updateTSMeetingOnBackend(updated);
  };

  const handleUpdateParticipantStatus = async (meetingId: string, participantId: string, status: Participant["status"]) => {
    if (!selectedMeeting) return;
    const now = new Date().toISOString();
    const updated: Meeting = {
      ...selectedMeeting,
      updatedAt: now,
      participants: selectedMeeting.participants.map(p =>
        p.id === participantId ? { ...p, status } : p
      ),
      timeline: [...selectedMeeting.timeline, {
        key: genUUID(),
        label: `Participant status updated to "${status}"`,
        timestamp: now,
        performedBy: currentUserName,
      }],
    };
    setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));
    setSelectedMeeting(updated);
    await updateTSMeetingOnBackend(updated);
  };

  // ── Attendance stats ─────────────────────────────────────────────────────────
  const getAttendance = (m: Meeting) => {
    const invited    = m.participants.length;
    const confirmed  = m.participants.filter(p => p.status === "Confirmed").length;
    const attended   = m.participants.filter(p => p.status === "Attended").length;
    const pct = invited ? Math.round((attended / invited) * 100) : 0;
    return { invited, confirmed, attended, pct };
  };

  // ── Form UI ──────────────────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="space-y-6 max-w-5xl mx-auto text-foreground">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => setView("list")} className="flex items-center gap-2 text-xs font-semibold text-blue-500 dark:text-blue-400 hover:underline cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> Back to Meetings
          </button>
        </div>
        <div>
          <h1 className="text-3xl font-orbitron font-bold text-blue-600 dark:text-blue-400">
            {editingMeeting ? "Edit Meeting" : "Create New Meeting"}
          </h1>
          <p className="text-text-dim text-sm mt-1">Fill in the details below to {editingMeeting ? "update" : "schedule"} your meeting.</p>
        </div>

        {formError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{formError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-5 dark-form-container">
            {/* Core Info */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
              <h3 className="text-[10px] font-bold font-orbitron uppercase tracking-wider text-blue-500 dark:text-blue-400 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />Meeting Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label>Meeting Title *</label>
                  <input type="text" placeholder="e.g. Q3 Sprint Planning Session" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label>Meeting Description</label>
                  <textarea rows={3} style={{ resize: "none" }} placeholder="Brief description of the meeting agenda and objectives..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Meeting Date *</label>
                  <input type="date" value={form.meetingDate} onChange={e => setForm(p => ({ ...p, meetingDate: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Meeting Time *</label>
                  <input type="time" value={form.meetingTime} onChange={e => setForm(p => ({ ...p, meetingTime: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Duration</label>
                  <select value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}>
                    {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label>Meeting Organizer *</label>
                  <input type="text" placeholder="e.g. John Doe" value={form.organizer} onChange={e => setForm(p => ({ ...p, organizer: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Meeting Type</label>
                  <select value={form.meetingType} onChange={e => setForm(p => ({ ...p, meetingType: e.target.value as MeetingType }))}>
                    <option value="Internal">Internal</option>
                    <option value="External">External</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label>Priority</label>
                  <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as MeetingPriority }))}>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label>Recurrence</label>
                  <select value={form.recurrence} onChange={e => setForm(p => ({ ...p, recurrence: e.target.value }))}>
                    <option value="None">None</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label>Related Ticket ID (Optional)</label>
                  <input type="text" placeholder="e.g. TC-1002" value={form.ticketId} onChange={e => setForm(p => ({ ...p, ticketId: e.target.value }))} />
                </div>
                {editingMeeting && (
                  <div className="flex flex-col gap-1">
                    <label>Status</label>
                    <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as MeetingStatus }))}>
                      {(["Scheduled", "In Progress", "Completed", "Cancelled", "Postponed"] as MeetingStatus[]).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col gap-2 md:col-span-2 border-t border-white/5 pt-4 mt-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isTsMeeting"
                      checked={form.isTsMeeting}
                      onChange={e => {
                        const checked = e.target.checked;
                        const tsmId = checked ? `TSM-${Math.floor(100000 + Math.random() * 900000)}` : "";
                        const tsPassword = checked ? Math.random().toString(36).slice(-6).toUpperCase() : "";
                        setForm(p => ({ ...p, isTsMeeting: checked, tsmId, tsPassword }));
                      }}
                      className="w-4 h-4 cursor-pointer accent-cyan-500 rounded border-white/10 bg-slate-900"
                    />
                    <label htmlFor="isTsMeeting" className="cursor-pointer font-semibold text-cyan-400 flex items-center gap-1.5">
                      <Video className="w-4 h-4" /> Enable TS Meeting Room
                    </label>
                  </div>
                  <p className="text-[10px] text-text-dim/80 ml-6">
                    Creates an in-app video conference room, generates a secure Room ID and Link automatically.
                  </p>
                </div>

                {form.isTsMeeting && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-text-dim">TS Meeting ID</label>
                      <input type="text" readOnly value={form.tsmId} className="bg-white/3 border-white/5 cursor-not-allowed opacity-80 text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-text-dim">Meeting Room ID</label>
                      <input type="text" readOnly value={`ROOM-${form.tsmId?.split("-")[1]}-TSME`} className="bg-white/3 border-white/5 cursor-not-allowed opacity-80 text-white" />
                    </div>
                    <div className="flex flex-col gap-1 md:col-span-2">
                      <label className="text-[10px] uppercase font-bold text-text-dim">Meeting Password (Optional)</label>
                      <input
                        type="text"
                        placeholder="Leave blank for no password, or edit..."
                        value={form.tsPassword}
                        onChange={e => setForm(p => ({ ...p, tsPassword: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Participants */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4 dark-form-container">
              <h3 className="text-[10px] font-bold font-orbitron uppercase tracking-wider text-purple-400 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />Participants
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label>Name</label>
                  <input type="text" placeholder="Participant name" value={form.newParticipantName} onChange={e => setForm(p => ({ ...p, newParticipantName: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleAddParticipant()} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Email</label>
                  <input type="email" placeholder="email@org.com" value={form.newParticipantEmail} onChange={e => setForm(p => ({ ...p, newParticipantEmail: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label>Role</label>
                  <select value={form.newParticipantRole} onChange={e => setForm(p => ({ ...p, newParticipantRole: e.target.value as Participant["role"] }))}>
                    <option value="Organizer">Organizer</option>
                    <option value="Co-host">Co-host</option>
                    <option value="Attendee">Attendee</option>
                    <option value="Optional">Optional</option>
                  </select>
                </div>
              </div>
              <Button onClick={handleAddParticipant} disabled={!form.newParticipantName.trim()} className="bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 text-xs font-bold py-1.5 cursor-pointer transition-all">
                <Plus className="w-3 h-3 mr-1.5" />Add Participant
              </Button>

              {form.participants.length > 0 ? (
                <div className="space-y-1.5 mt-2">
                  <div className="grid grid-cols-4 gap-2 text-[9px] uppercase font-bold tracking-wider text-text-dim px-2">
                    <span className="col-span-2">Participant</span>
                    <span>Role</span>
                    <span></span>
                  </div>
                  {form.participants.map(p => (
                    <div key={p.id} className="grid grid-cols-4 gap-2 items-center bg-white/3 rounded-lg px-2 py-1.5 border border-white/5">
                      <div className="col-span-2 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                        {p.email && <p className="text-[9px] text-text-dim truncate">{p.email}</p>}
                      </div>
                      <span className="text-[10px] text-purple-400 font-semibold">{p.role}</span>
                      <button onClick={() => handleRemoveParticipant(p.id)} className="text-red-400/60 hover:text-red-400 cursor-pointer justify-self-end">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-text-dim/50 text-center py-2">No participants added yet.</p>
              )}
            </div>

            {/* Notes */}
            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3 dark-form-container">
              <h3 className="text-[10px] font-bold font-orbitron uppercase tracking-wider text-blue-400 flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5" />Meeting Notes
              </h3>
              <textarea rows={4} style={{ resize: "none" }} placeholder="Add pre-meeting notes, agenda items, or key discussion points..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>

          {/* Right Column — Summary */}
          <div className="space-y-4">
            <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4 sticky top-4">
              <h3 className="text-[10px] font-bold font-orbitron uppercase tracking-wider text-text-dim">Meeting Summary</h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2 text-text-dim">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{form.meetingDate || "Not set"}</span>
                </div>
                <div className="flex items-center gap-2 text-text-dim">
                  <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>{form.meetingTime || "Not set"} · {form.duration}</span>
                </div>
                <div className="flex items-center gap-2 text-text-dim">
                  <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{form.participants.length} participant{form.participants.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-2 text-text-dim">
                  {form.meetingType === "Internal" ? <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Globe className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                  <span>{form.meetingType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: form.priority === "Critical" ? "#f87171" : form.priority === "High" ? "#fb923c" : form.priority === "Medium" ? "#facc15" : "#94a3b8" }} />
                  <span className={cn("font-bold", form.priority === "Critical" ? "text-red-400" : form.priority === "High" ? "text-orange-400" : form.priority === "Medium" ? "text-yellow-400" : "text-slate-400")}>{form.priority} Priority</span>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <Button onClick={handleSaveMeeting} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.25)] cursor-pointer transition-all">
                  {submitting ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Saving...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />{editingMeeting ? "Save Changes" : "Create Meeting"}</>}
                </Button>
                <Button onClick={() => setView("list")} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-foreground dark:text-white font-bold cursor-pointer text-xs">Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail View ───────────────────────────────────────────────────────────────
  if (view === "detail" && selectedMeeting) {
    const m = selectedMeeting;
    const att = getAttendance(m);

    return (
      <div className="space-y-6 max-w-6xl mx-auto text-foreground">
        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap justify-between">
          <button onClick={() => setView("list")} className="flex items-center gap-2 text-xs font-semibold text-blue-500 dark:text-blue-400 hover:underline cursor-pointer">
            <ArrowLeft className="w-4 h-4" /> All Meetings
          </button>
          <div className="flex gap-2 flex-wrap">
            {shareMsg && <span className="text-xs text-green-400 font-semibold flex items-center gap-1"><Check className="w-3 h-3" />{shareMsg}</span>}
            <Button onClick={() => handleShare(m)} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold cursor-pointer py-1.5">
              <Share2 className="w-3.5 h-3.5 mr-1.5" />Share
            </Button>
            <Button onClick={() => handleCopyLink(m.meetingUrl)} className={cn("text-xs font-bold py-1.5 border cursor-pointer transition-all", copied ? "bg-green-500/15 border-green-500/30 text-green-400" : "bg-white/5 hover:bg-white/10 border-white/10 text-white")}>
              {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy Link</>}
            </Button>
            {m.status !== "Cancelled" && m.status !== "Completed" && (
              <>
                <Button onClick={() => openEdit(m)} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold cursor-pointer py-1.5">
                  <Edit3 className="w-3.5 h-3.5 mr-1.5" />Edit
                </Button>
                <Button onClick={() => handleCompleteMeeting(m)} className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 text-xs font-bold cursor-pointer py-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Complete
                </Button>
                <Button onClick={() => handleCancelMeeting(m)} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold cursor-pointer py-1.5">
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />Cancel
                </Button>
              </>
            )}
            <Button onClick={() => handleDeleteMeeting(m)} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold cursor-pointer py-1.5">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Meeting Hero Card */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-blue-500 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{m.meetingId}</span>
                <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border capitalize", STATUS_COLORS[m.status])}>{m.status}</span>
                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", PRIORITY_COLORS[m.priority])}>{m.priority}</span>
                <span className="text-[10px] text-text-dim bg-white/5 px-2 py-0.5 rounded">{m.meetingType}</span>
              </div>
              <h1 className="text-2xl font-orbitron font-bold text-foreground dark:text-white">{m.title}</h1>
              {m.description && <p className="text-sm text-text-dim max-w-2xl">{m.description}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-white/5">
            {[
              { icon: Calendar, label: "Date", value: m.meetingDate, color: "text-blue-500 dark:text-blue-400" },
              { icon: Clock, label: "Time & Duration", value: `${m.meetingTime} · ${m.duration}`, color: "text-blue-500 dark:text-blue-400" },
              { icon: Users, label: "Organizer", value: m.organizer, color: "text-blue-400" },
              { icon: Users2, label: "Participants", value: `${att.invited} invited`, color: "text-blue-500 dark:text-blue-400" },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label}>
                <p className="text-[9px] uppercase font-bold tracking-wider text-text-dim">{label}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Icon className={cn("w-3.5 h-3.5 shrink-0", color)} />
                  <p className="text-xs font-semibold text-foreground dark:text-white">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Room & URL */}
          <div className="flex flex-col md:flex-row gap-3 pt-2">
            <div className="flex-1 bg-black/30 rounded-xl px-4 py-2.5 border border-white/5 flex items-center gap-2 min-w-0">
              <Hash className="w-3.5 h-3.5 text-text-dim shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] uppercase text-text-dim font-bold">Room ID</p>
                <p className="text-xs font-mono text-foreground dark:text-white font-bold truncate">{m.roomId}</p>
              </div>
            </div>
            <div className="flex-1 bg-black/30 rounded-xl px-4 py-2.5 border border-white/5 flex items-center gap-2 min-w-0">
              <Link2 className="w-3.5 h-3.5 text-text-dim shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase text-text-dim font-bold">Meeting URL</p>
                <p className="text-xs font-mono text-blue-500 dark:text-blue-400 truncate">{m.meetingUrl}</p>
              </div>
              <Button onClick={() => handleCopyLink(m.meetingUrl)} className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground dark:text-white text-[10px] font-bold py-1 px-2 cursor-pointer">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Attendance Summary Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Invited",   value: att.invited,   color: "text-blue-500 dark:text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
            { label: "Confirmed", value: att.confirmed,  color: "text-green-500 dark:text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20" },
            { label: "Attended",  value: att.attended,  color: "text-blue-500 dark:text-blue-400",   bg: "bg-blue-500/10",   border: "border-blue-500/20" },
            { label: "Attendance %", value: `${att.pct}%`, color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-900/10", border: "border-blue-900/20" },
          ].map(stat => (
            <div key={stat.label} className={cn("glass-panel rounded-2xl p-4 border flex flex-col justify-between", stat.bg, stat.border)}>
              <span className="text-[9px] uppercase font-bold tracking-wider text-text-dim">{stat.label}</span>
              <span className={cn("text-2xl font-orbitron font-bold mt-1", stat.color)}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
          <div className="flex border-b border-white/10 bg-black/20 overflow-x-auto">
            {([
              { id: "info",         label: "Meeting Info",     icon: FileText },
              { id: "participants", label: "Participants",      icon: Users },
              ...(m.isTsMeeting ? [{ id: "tsmeeting", label: "TS Meeting", icon: Video }] : []),
              { id: "timeline",     label: "Timeline",         icon: Layers },
              { id: "attachments",  label: "Attachments",      icon: Paperclip },
              { id: "activity",     label: "Discussion",       icon: MessageSquare },
            ] as { id: typeof detailTab; label: string; icon: React.ElementType }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setDetailTab(tab.id)}
                className={cn(
                  "flex-shrink-0 flex-1 min-w-[90px] py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all",
                  detailTab === tab.id ? "border-blue-500 text-blue-500 dark:text-blue-400 bg-white/5" : "border-transparent text-text-dim hover:text-white"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />{tab.label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-5">

            {/* TS Meeting Tab */}
            {detailTab === "tsmeeting" && m.isTsMeeting && (
              <div className="space-y-6">
                {/* Lobby/Join Section */}
                <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-gradient-to-br from-blue-950/20 to-slate-950/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-foreground dark:text-white flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></span>
                      TS Meeting Room is Ready
                    </h4>
                    <p className="text-xs text-text-dim mt-1">
                      Start and join the meeting directly inside the application using secure peer-to-peer WebRTC.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
                      <div>Room Link: <span className="font-mono text-blue-500 dark:text-blue-400 select-all">{window.location.origin}/ts-meeting/{m.tsmId}/lobby</span></div>
                      {m.tsPassword && <div>Password: <span className="font-mono text-blue-500 dark:text-blue-400 select-all">{m.tsPassword}</span></div>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      onClick={() => navigate(`/ts-meeting/${m.tsmId}/lobby`)}
                      className="bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-xs uppercase px-4 py-2.5 rounded-xl shadow-lg hover:shadow-cyan-500/10"
                    >
                      Join Meeting Room
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/ts-meeting/${m.tsmId}/lobby`);
                        alert("TS Meeting link copied to clipboard!");
                      }}
                      className="text-white hover:bg-white/5 text-xs font-bold px-4 py-2.5 rounded-xl border-white/10 hover:text-white"
                    >
                      Copy Link
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Attendance Log */}
                  <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                      <Users className="w-4 h-4" /> Live Attendance Log
                    </h4>
                    {loadingTsData ? (
                      <p className="text-center text-text-dim text-xs py-8 animate-pulse">Loading attendance...</p>
                    ) : tsAttendance.length === 0 ? (
                      <p className="text-center text-text-dim text-xs py-8">No participants have joined yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                        {tsAttendance.map((record: any) => (
                          <div key={record.id} className="flex items-center justify-between p-2.5 bg-white/3 rounded-xl border border-white/5 text-xs">
                            <div>
                              <p className="font-semibold text-white">{record.name}</p>
                              <p className="text-[10px] text-text-dim font-mono">{record.peer_id}</p>
                            </div>
                            <div className="text-right font-medium">
                              <p className="text-slate-300">Joined: {record.join_time}</p>
                              <p className="text-text-dim">Left: {record.leave_time || "In Room"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chat Archive */}
                  <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Room Chat History
                    </h4>
                    {loadingTsData ? (
                      <p className="text-center text-text-dim text-xs py-8 animate-pulse">Loading chat history...</p>
                    ) : tsChat.length === 0 ? (
                      <p className="text-center text-text-dim text-xs py-8">No chat messages archived for this meeting.</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1 flex flex-col">
                        {tsChat.map((msg: any) => (
                          <div key={msg.id} className="p-2.5 bg-white/3 rounded-xl border border-white/5 text-xs">
                            <div className="flex items-center justify-between text-text-dim text-[9px] mb-1">
                              <span className="font-bold text-slate-300">{msg.sender_name}</span>
                              <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {msg.type === "file" ? (
                              <div className="flex items-center justify-between bg-black/20 p-2 rounded-lg mt-1 border border-white/5">
                                <span className="font-medium text-white truncate max-w-[150px]">{msg.file_name || msg.text}</span>
                                <a href={msg.file_url} download={msg.file_name} className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 shrink-0 ml-2">
                                  <Download className="w-3 h-3" /> Download
                                </a>
                              </div>
                            ) : (
                              <p className="text-slate-200">{msg.text}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Info Tab */}
            {detailTab === "info" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-white/3 p-4 rounded-xl border border-white/5 text-xs">
                  <div><p className="text-[9px] uppercase font-bold text-text-dim">Meeting ID</p><p className="mt-0.5 font-mono font-bold text-cyan-400">{m.meetingId}</p></div>
                  <div><p className="text-[9px] uppercase font-bold text-text-dim">Room ID</p><p className="mt-0.5 font-mono text-white">{m.roomId}</p></div>
                  <div><p className="text-[9px] uppercase font-bold text-text-dim">Created By</p><p className="mt-0.5 text-white font-semibold">{m.createdBy}</p></div>
                  <div><p className="text-[9px] uppercase font-bold text-text-dim">Created At</p><p className="mt-0.5 text-white">{new Date(m.createdAt).toLocaleString()}</p></div>
                  <div className="col-span-2"><p className="text-[9px] uppercase font-bold text-text-dim">Meeting URL</p><p className="mt-0.5 text-cyan-400 font-mono break-all">{m.meetingUrl}</p></div>
                  {m.description && <div className="col-span-2"><p className="text-[9px] uppercase font-bold text-text-dim">Description</p><p className="mt-0.5 text-white whitespace-pre-wrap">{m.description}</p></div>}
                  {m.notes && <div className="col-span-2"><p className="text-[9px] uppercase font-bold text-text-dim">Notes</p><p className="mt-0.5 text-white whitespace-pre-wrap">{m.notes}</p></div>}
                </div>
              </div>
            )}

            {/* Participants Tab */}
            {detailTab === "participants" && (
              <div className="space-y-3">
                {m.participants.length === 0 ? (
                  <p className="text-center text-text-dim text-xs py-8">No participants added to this meeting.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-2 text-[9px] uppercase font-bold tracking-wider text-text-dim px-3">
                      <span className="col-span-2">Participant</span><span>Role</span><span>Status</span><span>Update</span>
                    </div>
                    {m.participants.map(p => (
                      <div key={p.id} className="grid grid-cols-5 gap-2 items-center glass-panel px-3 py-2.5 rounded-xl border border-white/5">
                        <div className="col-span-2 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                          {p.email && <p className="text-[9px] text-text-dim truncate">{p.email}</p>}
                        </div>
                        <span className="text-[10px] text-purple-400 font-semibold">{p.role}</span>
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border text-center",
                          p.status === "Confirmed" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                          p.status === "Attended"  ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                          p.status === "Declined"  ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          p.status === "No-show"   ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                          "bg-white/5 text-text-dim border-white/10"
                        )}>{p.status}</span>
                        <select
                          value={p.status}
                          onChange={e => handleUpdateParticipantStatus(m.id, p.id, e.target.value as Participant["status"])}
                          className="bg-black/40 border border-white/10 rounded-lg text-[10px] text-white outline-none px-1.5 py-1 cursor-pointer focus:border-cyan-500/50 transition-all"
                        >
                          {(["Invited","Confirmed","Declined","Attended","No-show"] as Participant["status"][]).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timeline Tab */}
            {detailTab === "timeline" && (
              <div className="space-y-4">
                {m.timeline.length === 0 ? (
                  <p className="text-center text-text-dim text-xs py-8">No timeline events.</p>
                ) : (
                  <div className="relative border-l-2 border-white/8 pl-6 ml-3 space-y-5">
                    {[...m.timeline].reverse().map((ev, idx) => (
                      <div key={ev.key} className="relative">
                        <div className="absolute -left-[31px] top-2 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-sn-dark shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                        <div className="glass-panel p-3.5 rounded-xl border border-white/5 space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{ev.label}</span>
                            <span className="text-[10px] text-text-dim/70 font-mono">{new Date(ev.timestamp).toLocaleString()}</span>
                          </div>
                          {ev.performedBy && <p className="text-[10px] text-text-dim/60">By: <strong>{ev.performedBy}</strong></p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Attachments Tab */}
            {detailTab === "attachments" && (
              <div className="space-y-4">
                {/* Upload area */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(["attachment","agenda","mom","notes"] as Attachment["type"][]).map(type => (
                    <label key={type} className="border border-dashed border-white/15 rounded-xl p-4 flex flex-col items-center gap-2 text-center hover:border-cyan-500/40 transition-all bg-black/20 cursor-pointer group">
                      <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0], type); }} />
                      <UploadCloud className="w-6 h-6 text-white/20 group-hover:text-cyan-400 transition-colors" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-text-dim group-hover:text-white transition-colors">
                        {type === "mom" ? "MOM" : type.charAt(0).toUpperCase() + type.slice(1)}
                      </span>
                    </label>
                  ))}
                </div>

                {m.attachments.length === 0 ? (
                  <p className="text-center text-text-dim text-xs py-4">No attachments uploaded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {m.attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-3 glass-panel p-3 rounded-xl border border-white/5">
                        <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 shrink-0">
                          <Paperclip className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{att.name}</p>
                          <p className="text-[9px] text-text-dim">{(att.size/1024).toFixed(1)} KB · {att.type.toUpperCase()} · {new Date(att.uploadedAt).toLocaleDateString()}</p>
                        </div>
                        <a href={att.url} download={att.name} className="text-cyan-400 hover:text-cyan-300 cursor-pointer">
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Activity / Comments Tab */}
            {detailTab === "activity" && (
              <div className="space-y-4 dark-form-container">
                <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                  {m.comments.length === 0 ? (
                    <p className="text-center text-text-dim text-xs py-6">No comments yet. Start the discussion!</p>
                  ) : (
                    m.comments.map(c => (
                      <div key={c.id} className="glass-panel p-3.5 rounded-xl border border-white/5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{c.author}</span>
                          <span className="text-[10px] text-text-dim/60">{new Date(c.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-text-dim/90 whitespace-pre-wrap">{c.text}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    placeholder="Add a comment or discussion note..."
                    value={form.newComment}
                    onChange={e => setForm(p => ({ ...p, newComment: e.target.value }))}
                    style={{ resize: "none" }}
                    className="flex-1"
                  />
                  <Button onClick={handleAddComment} disabled={!form.newComment.trim()} className="self-end bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 font-bold text-xs px-3 cursor-pointer transition-all">
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  // ── List View ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto text-foreground">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-orbitron font-bold tracking-tight text-blue-600 dark:text-blue-400">
            CREATE MEETING
          </h1>
          <p className="text-text-dim text-sm mt-1">
            Schedule and manage internal meetings — generate unique room IDs, track attendance, and share meeting links.
          </p>
        </div>
        <div className="flex gap-2 self-start md:self-center">
          <Button
            onClick={openCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-2" /> New Meeting
          </Button>
          <Button
            onClick={handleCreateInstantMeeting}
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] transition-all cursor-pointer"
          >
            <Video className="w-4 h-4 mr-2" /> Instant Meeting
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total",      value: stats.total,      color: "from-blue-500/10 to-indigo-500/5",   border: "border-blue-500/20",   icon: Calendar,      iconColor: "text-blue-500 dark:text-blue-400" },
          { label: "Scheduled",  value: stats.scheduled,  color: "from-blue-500/10 to-sky-500/5",      border: "border-blue-500/20",   icon: Clock,         iconColor: "text-blue-500 dark:text-blue-400" },
          { label: "In Progress",value: stats.inProgress, color: "from-yellow-500/10 to-amber-500/5",  border: "border-yellow-500/20", icon: PlayCircle,    iconColor: "text-yellow-400" },
          { label: "Completed",  value: stats.completed,  color: "from-green-500/10 to-emerald-500/5", border: "border-green-500/20",  icon: CheckCircle2,  iconColor: "text-green-400" },
          { label: "Cancelled",  value: stats.cancelled,  color: "from-red-500/10 to-rose-500/5",      border: "border-red-500/20",    icon: XCircle,       iconColor: "text-red-400" },
        ].map((s, i) => (
          <div key={i} className={cn("glass-panel p-4 rounded-2xl border flex flex-col justify-between shadow-lg", s.color, s.border)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim">{s.label}</span>
              <s.icon className={cn("w-4 h-4", s.iconColor)} />
            </div>
            <span className="text-3xl font-orbitron font-bold mt-2 text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-text-dim text-foreground"
          />
        </div>
        {([
          { label: "Status", value: statusFilter, onChange: (v: string) => setStatusFilter(v as any), options: ["","Scheduled","In Progress","Completed","Cancelled","Postponed"], placeholder: "All Statuses" },
          { label: "Type",   value: typeFilter,   onChange: (v: string) => setTypeFilter(v as any),   options: ["","Internal","External"],                                        placeholder: "All Types" },
          { label: "Priority",value: priorityFilter, onChange: (v: string) => setPriorityFilter(v as any), options: ["","Critical","High","Medium","Low"],                       placeholder: "All Priorities" },
        ]).map(f => (
          <select key={f.label} value={f.value} onChange={e => f.onChange(e.target.value)} className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 text-foreground min-w-[130px]">
            {f.options.map(o => <option key={o} value={o} className="bg-[#0b0c16] text-white">{o || f.placeholder}</option>)}
          </select>
        ))}
        <Button onClick={() => { setSearchQuery(""); setStatusFilter(""); setTypeFilter(""); setPriorityFilter(""); }} className="bg-white/5 hover:bg-white/10 border border-white/10 text-foreground dark:text-white text-xs font-bold cursor-pointer py-2">
          Reset
        </Button>
      </div>

      {/* Meeting List */}
      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20">
              <Calendar className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold">No Meetings Found</h3>
              <p className="text-text-dim text-xs mt-1 max-w-sm">
                {meetings.length === 0 ? "Get started by creating your first meeting." : "No meetings match your current filters."}
              </p>
            </div>
            {meetings.length === 0 && (
              <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white font-bold border border-blue-500/20 cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />Create First Meeting
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(m => {
              const att = getAttendance(m);
              return (
                <div
                  key={m.id}
                  className="p-5 hover:bg-white/5 transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                  onClick={() => openDetail(m)}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-blue-500 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">{m.meetingId}</span>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize", STATUS_COLORS[m.status])}>{m.status}</span>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", PRIORITY_COLORS[m.priority])}>{m.priority}</span>
                      <span className="text-[10px] text-text-dim bg-white/5 px-2 py-0.5 rounded">{m.meetingType}</span>
                    </div>
                    <h3 className="text-base font-bold truncate text-foreground hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{m.title}</h3>
                    {m.description && <p className="text-xs text-text-dim truncate max-w-xl">{m.description}</p>}
                    <div className="text-[10px] text-text-dim/60 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-blue-500/60" />{m.meetingDate}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500/60" />{m.meetingTime} · {m.duration}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 text-blue-500/60" />{att.invited} invited</span>
                      <span>Organizer: <strong>{m.organizer}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start md:self-center" onClick={e => e.stopPropagation()}>
                    <Button onClick={() => handleCopyLink(m.meetingUrl)} className="bg-white/5 hover:bg-white/10 border border-white/10 text-foreground dark:text-white text-xs py-1.5 px-2 cursor-pointer" title="Copy Link">
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <Button onClick={() => openEdit(m)} className="bg-white/5 hover:bg-white/10 border border-white/10 text-foreground dark:text-white text-xs py-1.5 px-2 cursor-pointer" title="Edit">
                      <Edit3 className="w-3 h-3" />
                    </Button>
                    {m.status !== "Cancelled" && m.status !== "Completed" && (
                      <Button onClick={() => handleCancelMeeting(m)} className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs py-1.5 px-2 cursor-pointer" title="Cancel">
                        <XCircle className="w-3 h-3" />
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 text-white/30" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
