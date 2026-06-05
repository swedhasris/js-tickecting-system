import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { 
  Plus, Search, Calendar, Clock, Video, Users, FileText, 
  UploadCloud, Download, Printer, History, Trash2, Edit3, 
  Eye, Save, X, ChevronRight, AlertCircle, CheckCircle2, 
  RefreshCw, FileSpreadsheet, ChevronDown, Check, ArrowLeft,
  FileDown, BookOpen,
  // ── NEW ICONS (additive) ──
  Link, Copy, Mic, Bell, MapPin, Wifi, Radio, Film,
  Timer, Users2, ClipboardCheck, CheckSquare, PlayCircle,
  UploadIcon, BellRing, BellOff, ChevronUp, LogIn, LogOut, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Meeting {
  id: number;
  meeting_id: string;
  creation_method: "upload" | "template";
  title: string;
  meeting_date: string;
  platform: string;
  conducted_by: string;
  attendees: string;
  absentees: string;
  one_line_summary: string;
  short_description: string;
  detailed_description: string;
  discussion_points: string;
  decisions_taken: string;
  action_items: string;
  responsible_person: string;
  target_date: string;
  next_steps: string;
  remarks: string;
  file_path: string;
  file_name: string;
  file_size: number;
  status: "Draft" | "Submitted" | "Approved" | "Closed";
  version: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

interface Version {
  id: number;
  meeting_db_id: number;
  meeting_id: string;
  version: number;
  title: string;
  meeting_date: string;
  status: string;
  file_path: string;
  file_name: string;
  template_data: string; // JSON string
  updated_by: string;
  updated_by_name: string;
  change_summary: string;
  created_at: string;
}

interface AuditLog {
  id: number;
  meeting_id: string;
  action: string;
  performed_by: string;
  performed_by_name: string;
  details: string;
  created_at: string;
}

// ── NEW INTERFACES (additive) ──────────────────────────────────────────────
type MeetingMode = "physical" | "virtual" | "hybrid";

interface VirtualMeetingData {
  mode: MeetingMode;
  meetingLink: string;
  roomId: string;
  password: string;
}

interface ParticipantLog {
  name: string;
  joinTime: string;
  leaveTime: string;
}

interface AttendanceData {
  totalInvited: number;
  totalJoined: number;
  participantLogs: ParticipantLog[];
}

interface RecordingData {
  fileName: string;
  fileSize: number;
  fileUrl: string;
  uploadedAt: string;
}

type NotificationKey =
  | "scheduled"
  | "reminder"
  | "started"
  | "momPending"
  | "completed";

type NotificationsState = Record<NotificationKey, boolean>;

interface TimelineMilestone {
  key: string;
  label: string;
  timestamp: string;
  done: boolean;
  icon: React.ElementType;
  color: string;
  glowColor: string;
}
// ─────────────────────────────────────────────────────────────────────────────

export function MeetingManagement() {
  const { user, profile } = useAuth();
  
  // Lists and loading
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Selected meeting details drawer
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<(Meeting & { versions: Version[]; auditLogs: AuditLog[] }) | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailTab, setDetailTab] = useState<"details" | "versions" | "audit" | "timeline" | "notifications">("details");

  // ── NEW STATE VARIABLES (additive) ────────────────────────────────────────
  const defaultVirtualData: VirtualMeetingData = { mode: "physical", meetingLink: "", roomId: "", password: "" };
  const defaultAttendance: AttendanceData = { totalInvited: 0, totalJoined: 0, participantLogs: [] };
  const defaultNotifications: NotificationsState = { scheduled: true, reminder: true, started: false, momPending: true, completed: false };
  const defaultRecording: RecordingData = { fileName: "", fileSize: 0, fileUrl: "", uploadedAt: "" };

  const [virtualData, setVirtualData] = useState<VirtualMeetingData>(defaultVirtualData);
  const [attendanceData, setAttendanceData] = useState<AttendanceData>(defaultAttendance);
  const [notifications, setNotifications] = useState<NotificationsState>(defaultNotifications);
  const [recordingData, setRecordingData] = useState<RecordingData>(defaultRecording);
  const [timelineMarks, setTimelineMarks] = useState<Record<string, string>>({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [virtualSectionOpen, setVirtualSectionOpen] = useState(true);
  const [attendanceSectionOpen, setAttendanceSectionOpen] = useState(true);
  const [newParticipant, setNewParticipant] = useState({ name: "", joinTime: "", leaveTime: "" });
  const [recordingUploading, setRecordingUploading] = useState(false);
  // ──────────────────────────────────────────────────────────────────────────

  // Create wizard states
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: Choose mode, 2: Form/Upload
  const [creationMethod, setCreationMethod] = useState<"upload" | "template" | null>(null);
  
  // Edit states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<number | null>(null);

  // Form State
  const initialFormState = {
    title: "",
    meetingDate: new Date().toISOString().slice(0, 16), // datetime-local format
    platform: "Zoom",
    conductedBy: "",
    attendees: "",
    absentees: "",
    oneLineSummary: "",
    shortDescription: "",
    detailedDescription: "",
    discussionPoints: "",
    decisionsTaken: "",
    actionItems: "",
    responsiblePerson: "",
    targetDate: "",
    nextSteps: "",
    remarks: "",
    filePath: "",
    fileName: "",
    fileSize: 0,
    status: "Draft" as const,
  };
  const [formData, setFormData] = useState(initialFormState);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  
  // Auto-Save States
  const [tempMeetingId, setTempMeetingId] = useState<number | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState("");

  // Refs for tracking changes for auto-save
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Fetch meetings on mount & when filters change
  useEffect(() => {
    fetchMeetings();
  }, [statusFilter, platformFilter, dateFilter]);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (platformFilter) params.append("platform", platformFilter);
      if (dateFilter) params.append("date", dateFilter);
      if (searchQuery) params.append("search", searchQuery);

      const res = await fetch(`/api/meetings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch (err) {
      console.error("Error fetching meetings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMeetings();
  };

  // Fetch full meeting details, versions, and logs
  const fetchMeetingDetails = async (id: number) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/meetings/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedMeeting(data);
      }
    } catch (err) {
      console.error("Error fetching meeting details:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (selectedMeetingId !== null) {
      fetchMeetingDetails(selectedMeetingId);
    } else {
      setSelectedMeeting(null);
    }
  }, [selectedMeetingId]);

  // ── NEW: Load/Save virtual meeting data from localStorage ─────────────────
  const getStorageKey = (meetingId: string, suffix: string) => `aetherops_meeting_${meetingId}_${suffix}`;

  useEffect(() => {
    if (!selectedMeeting) return;
    const mid = selectedMeeting.meeting_id;
    try {
      const vd = localStorage.getItem(getStorageKey(mid, "virtual"));
      const ad = localStorage.getItem(getStorageKey(mid, "attendance"));
      const nd = localStorage.getItem(getStorageKey(mid, "notifications"));
      const rd = localStorage.getItem(getStorageKey(mid, "recording"));
      const td = localStorage.getItem(getStorageKey(mid, "timeline"));
      setVirtualData(vd ? JSON.parse(vd) : defaultVirtualData);
      setAttendanceData(ad ? JSON.parse(ad) : defaultAttendance);
      setNotifications(nd ? JSON.parse(nd) : defaultNotifications);
      setRecordingData(rd ? JSON.parse(rd) : defaultRecording);
      setTimelineMarks(td ? JSON.parse(td) : { created: selectedMeeting.created_at });
    } catch { /* ignore parse errors */ }
  }, [selectedMeeting?.meeting_id]);

  const saveVirtualData = (data: VirtualMeetingData) => {
    if (!selectedMeeting) return;
    setVirtualData(data);
    localStorage.setItem(getStorageKey(selectedMeeting.meeting_id, "virtual"), JSON.stringify(data));
  };

  const saveAttendanceData = (data: AttendanceData) => {
    if (!selectedMeeting) return;
    setAttendanceData(data);
    localStorage.setItem(getStorageKey(selectedMeeting.meeting_id, "attendance"), JSON.stringify(data));
  };

  const saveNotifications = (data: NotificationsState) => {
    if (!selectedMeeting) return;
    setNotifications(data);
    localStorage.setItem(getStorageKey(selectedMeeting.meeting_id, "notifications"), JSON.stringify(data));
  };

  const saveRecordingData = (data: RecordingData) => {
    if (!selectedMeeting) return;
    setRecordingData(data);
    localStorage.setItem(getStorageKey(selectedMeeting.meeting_id, "recording"), JSON.stringify(data));
  };

  const markTimelineMilestone = (key: string) => {
    if (!selectedMeeting) return;
    const updated = { ...timelineMarks, [key]: new Date().toISOString() };
    setTimelineMarks(updated);
    localStorage.setItem(getStorageKey(selectedMeeting.meeting_id, "timeline"), JSON.stringify(updated));
  };

  // ── NEW: Helper Functions ─────────────────────────────────────────────────
  const generateRoomId = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 12 }, (_, i) =>
      i > 0 && i % 4 === 0 ? "-" + chars[Math.floor(Math.random() * chars.length)] : chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      /* fallback */
    }
  };

  const getAttendancePct = () => {
    if (!attendanceData.totalInvited) return 0;
    return Math.min(100, Math.round((attendanceData.totalJoined / attendanceData.totalInvited) * 100));
  };

  const handleAddParticipantLog = () => {
    if (!newParticipant.name) return;
    const updated: AttendanceData = {
      ...attendanceData,
      participantLogs: [...attendanceData.participantLogs, { ...newParticipant }],
    };
    saveAttendanceData(updated);
    setNewParticipant({ name: "", joinTime: "", leaveTime: "" });
  };

  const handleRemoveParticipantLog = (idx: number) => {
    const updated: AttendanceData = {
      ...attendanceData,
      participantLogs: attendanceData.participantLogs.filter((_, i) => i !== idx),
    };
    saveAttendanceData(updated);
  };

  const handleRecordingUpload = (file: File) => {
    setRecordingUploading(true);
    // Simulate local processing (no backend upload for additive-only feature)
    setTimeout(() => {
      const url = URL.createObjectURL(file);
      const data: RecordingData = {
        fileName: file.name,
        fileSize: file.size,
        fileUrl: url,
        uploadedAt: new Date().toISOString(),
      };
      saveRecordingData(data);
      setRecordingUploading(false);
    }, 800);
  };

  const getMeetingTimeline = (): TimelineMilestone[] => {
    const m = selectedMeeting;
    if (!m) return [];
    return [
      { key: "created",   label: "Meeting Created",        timestamp: timelineMarks["created"] || m.created_at, done: true,                          icon: FileText,      color: "text-cyan-400",   glowColor: "rgba(6,182,212,0.6)" },
      { key: "started",   label: "Meeting Started",        timestamp: timelineMarks["started"] || "",           done: !!timelineMarks["started"],    icon: PlayCircle,    color: "text-green-400",  glowColor: "rgba(34,197,94,0.6)" },
      { key: "joined",    label: "Participants Joined",    timestamp: timelineMarks["joined"] || "",            done: !!timelineMarks["joined"],     icon: Users2,        color: "text-blue-400",   glowColor: "rgba(59,130,246,0.6)" },
      { key: "momUpload", label: "MOM Uploaded",           timestamp: timelineMarks["momUpload"] || (m.file_path ? m.updated_at : ""), done: !!m.file_path || !!timelineMarks["momUpload"], icon: ClipboardCheck, color: "text-purple-400", glowColor: "rgba(168,85,247,0.6)" },
      { key: "completed", label: "Meeting Completed",      timestamp: timelineMarks["completed"] || (m.status === "Closed" ? m.updated_at : ""), done: m.status === "Closed" || !!timelineMarks["completed"], icon: CheckSquare, color: "text-emerald-400", glowColor: "rgba(16,185,129,0.6)" },
    ];
  };
  // ──────────────────────────────────────────────────────────────────────────

  // Perform Auto-Save for Drafts
  const performAutoSave = async () => {
    const data = formDataRef.current;
    if (!data.title || !data.meetingDate) return;

    try {
      const payload = {
        creationMethod: "template",
        title: data.title,
        meetingDate: data.meetingDate,
        platform: data.platform,
        conductedBy: data.conductedBy,
        attendees: data.attendees,
        absentees: data.absentees,
        oneLineSummary: data.oneLineSummary,
        shortDescription: data.shortDescription,
        detailedDescription: data.detailedDescription,
        discussionPoints: data.discussionPoints,
        decisionsTaken: data.decisionsTaken,
        actionItems: data.actionItems,
        responsiblePerson: data.responsiblePerson,
        targetDate: data.targetDate,
        nextSteps: data.nextSteps,
        remarks: data.remarks,
        status: "Draft",
        createdBy: user?.uid || profile?.uid || "System",
        createdByName: profile?.name || user?.email || "System",
      };

      if (tempMeetingId) {
        // Update draft
        const res = await fetch(`/api/meetings/${tempMeetingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            isAutoSave: true,
            updatedBy: user?.uid || profile?.uid || "System",
            updatedByName: profile?.name || user?.email || "System",
          }),
        });
        if (res.ok) {
          setAutoSaveStatus(`Draft saved automatically at ${new Date().toLocaleTimeString()}`);
        }
      } else {
        // Create draft
        const res = await fetch("/api/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const result = await res.json();
          setTempMeetingId(result.id);
          setAutoSaveStatus(`Draft saved automatically at ${new Date().toLocaleTimeString()}`);
        }
      }
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  };

  // Auto-Save Interval Effect
  useEffect(() => {
    if (!showCreateWizard || creationMethod !== "template" || isSubmitting) {
      setAutoSaveStatus("");
      return;
    }

    const interval = setInterval(() => {
      performAutoSave();
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [showCreateWizard, creationMethod, tempMeetingId, isSubmitting]);

  // Edit Mode Auto-Save Effect
  useEffect(() => {
    if (!showEditModal || formData.status !== "Draft" || isSubmitting || !editingMeetingId) {
      setAutoSaveStatus("");
      return;
    }

    const interval = setInterval(() => {
      const data = formDataRef.current;
      if (!data.title || !data.meetingDate) return;

      const payload = {
        title: data.title,
        meetingDate: data.meetingDate,
        platform: data.platform,
        conductedBy: data.conductedBy,
        attendees: data.attendees,
        absentees: data.absentees,
        oneLineSummary: data.oneLineSummary,
        shortDescription: data.shortDescription,
        detailedDescription: data.detailedDescription,
        discussionPoints: data.discussionPoints,
        decisionsTaken: data.decisionsTaken,
        actionItems: data.actionItems,
        responsiblePerson: data.responsiblePerson,
        targetDate: data.targetDate,
        nextSteps: data.nextSteps,
        remarks: data.remarks,
        status: "Draft",
        isAutoSave: true,
        updatedBy: user?.uid || profile?.uid || "System",
        updatedByName: profile?.name || user?.email || "System",
      };

      fetch(`/api/meetings/${editingMeetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      .then(res => {
        if (res.ok) {
          setAutoSaveStatus(`Draft saved automatically at ${new Date().toLocaleTimeString()}`);
        }
      })
      .catch(err => console.error("Edit auto-save failed:", err));
    }, 10000);

    return () => clearInterval(interval);
  }, [showEditModal, formData.status, editingMeetingId, isSubmitting]);

  // Line Count Helpers
  const countLines = (str: string) => {
    if (!str) return 0;
    return str.split("\n").length;
  };

  // File Upload Helper
  const handleFileUpload = async (file: File) => {
    const allowedExts = [".pdf", ".docx", ".xlsx"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExts.includes(ext)) {
      setFormError(`Invalid file format: ${ext}. Only PDF, DOCX, and XLSX files are allowed.`);
      return;
    }

    setUploading(true);
    setFormError("");
    const uploadData = new FormData();
    uploadData.append("file", file);

    try {
      const res = await fetch("/api/moms/upload", {
        method: "POST",
        body: uploadData,
      });

      if (res.ok) {
        const result = await res.json();
        setFormData(prev => ({
          ...prev,
          filePath: result.file_path,
          fileName: result.file_name,
          fileSize: result.file_size,
        }));
        setUploadFile(file);
      } else {
        const errorData = await res.json();
        setFormError(errorData.error || "File upload failed.");
      }
    } catch (err: any) {
      setFormError("File upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Submit/Save handlers
  const handleSaveMeeting = async (status: "Draft" | "Submitted") => {
    setFormError("");

    if (!formData.title) {
      setFormError("Meeting Title is required.");
      return;
    }
    if (!formData.meetingDate) {
      setFormError("Meeting Date & Time is required.");
      return;
    }

    // Line Limit checks for template mode
    if (creationMethod === "template" || (showEditModal && !formData.filePath)) {
      if (countLines(formData.shortDescription) > 9) {
        setFormError("Short Description exceeds 9 lines limit.");
        return;
      }
      if (countLines(formData.detailedDescription) > 20) {
        setFormError("Detailed Description exceeds 20 lines limit.");
        return;
      }
    } else {
      // Upload mode validation
      if (!formData.filePath) {
        setFormError("MOM document upload is required.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const url = showEditModal ? `/api/meetings/${editingMeetingId}` : "/api/meetings";
      const method = showEditModal ? "PUT" : "POST";
      
      const payload = showEditModal ? {
        title: formData.title,
        meetingDate: formData.meetingDate,
        platform: formData.platform,
        conductedBy: formData.conductedBy,
        attendees: formData.attendees,
        absentees: formData.absentees,
        oneLineSummary: formData.oneLineSummary,
        shortDescription: formData.shortDescription,
        detailedDescription: formData.detailedDescription,
        discussionPoints: formData.discussionPoints,
        decisionsTaken: formData.decisionsTaken,
        actionItems: formData.actionItems,
        responsiblePerson: formData.responsiblePerson,
        targetDate: formData.targetDate,
        nextSteps: formData.nextSteps,
        remarks: formData.remarks,
        filePath: formData.filePath,
        fileName: formData.fileName,
        fileSize: formData.fileSize,
        status: status,
        updatedBy: user?.uid || profile?.uid || "System",
        updatedByName: profile?.name || user?.email || "System",
        changeSummary: showEditModal ? `MOM updated and set to ${status}` : "MOM created",
      } : {
        creationMethod: creationMethod,
        title: formData.title,
        meetingDate: formData.meetingDate,
        platform: formData.platform,
        conductedBy: formData.conductedBy,
        attendees: formData.attendees,
        absentees: formData.absentees,
        oneLineSummary: formData.oneLineSummary,
        shortDescription: formData.shortDescription,
        detailedDescription: formData.detailedDescription,
        discussionPoints: formData.discussionPoints,
        decisionsTaken: formData.decisionsTaken,
        actionItems: formData.actionItems,
        responsiblePerson: formData.responsiblePerson,
        targetDate: formData.targetDate,
        nextSteps: formData.nextSteps,
        remarks: formData.remarks,
        filePath: formData.filePath,
        fileName: formData.fileName,
        fileSize: formData.fileSize,
        status: status,
        createdBy: user?.uid || profile?.uid || "System",
        createdByName: profile?.name || user?.email || "System",
      };

      // If we did auto-save during creation, we put to the generated meeting ID instead
      let finalUrl = url;
      let finalMethod = method;
      if (!showEditModal && tempMeetingId) {
        finalUrl = `/api/meetings/${tempMeetingId}`;
        finalMethod = "PUT";
      }

      const res = await fetch(finalUrl, {
        method: finalMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowCreateWizard(false);
        setShowEditModal(false);
        setFormData(initialFormState);
        setUploadFile(null);
        setTempMeetingId(null);
        fetchMeetings();
        if (selectedMeetingId) {
          fetchMeetingDetails(selectedMeetingId);
        }
      } else {
        const errorData = await res.json();
        setFormError(errorData.error || "Failed to save MOM.");
      }
    } catch (err: any) {
      setFormError("Failed to save MOM: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (meeting: Meeting) => {
    setEditingMeetingId(meeting.id);
    setFormData({
      title: meeting.title,
      meetingDate: new Date(meeting.meeting_date).toISOString().slice(0, 16),
      platform: meeting.platform || "Zoom",
      conductedBy: meeting.conducted_by || "",
      attendees: meeting.attendees || "",
      absentees: meeting.absentees || "",
      oneLineSummary: meeting.one_line_summary || "",
      shortDescription: meeting.short_description || "",
      detailedDescription: meeting.detailed_description || "",
      discussionPoints: meeting.discussion_points || "",
      decisionsTaken: meeting.decisions_taken || "",
      actionItems: meeting.action_items || "",
      responsiblePerson: meeting.responsible_person || "",
      targetDate: meeting.target_date || "",
      nextSteps: meeting.next_steps || "",
      remarks: meeting.remarks || "",
      filePath: meeting.file_path || "",
      fileName: meeting.file_name || "",
      fileSize: meeting.file_size || 0,
      status: meeting.status,
    });
    setCreationMethod(meeting.creation_method);
    setFormError("");
    setAutoSaveStatus("");
    setShowEditModal(true);
  };

  const handleDeleteClick = async (meetingId: number) => {
    if (!window.confirm("Are you sure you want to delete this meeting? This will also delete all version records and audit trails.")) {
      return;
    }
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSelectedMeetingId(null);
        fetchMeetings();
      }
    } catch (err) {
      console.error("Failed to delete meeting:", err);
    }
  };

  const handleUpdateStatus = async (meeting: Meeting, newStatus: "Draft" | "Submitted" | "Approved" | "Closed") => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          updatedBy: user?.uid || profile?.uid || "System",
          updatedByName: profile?.name || user?.email || "System",
          changeSummary: `Status changed to ${newStatus}`,
        }),
      });
      if (res.ok) {
        fetchMeetings();
        fetchMeetingDetails(meeting.id);
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  // Restore historical version
  const handleRestoreVersion = async (version: Version) => {
    if (!selectedMeeting) return;
    if (!window.confirm(`Are you sure you want to restore to Version ${version.version}? This will update the active record.`)) {
      return;
    }

    try {
      let payload: any = {
        title: version.title,
        meetingDate: version.meeting_date,
        status: version.status,
        filePath: version.file_path,
        fileName: version.file_name,
        updatedBy: user?.uid || profile?.uid || "System",
        updatedByName: profile?.name || user?.email || "System",
        changeSummary: `Restored Version ${version.version}`,
      };

      if (version.template_data) {
        try {
          const tData = JSON.parse(version.template_data);
          payload = {
            ...payload,
            platform: tData.platform,
            conductedBy: tData.conducted_by,
            attendees: tData.attendees,
            absentees: tData.absentees,
            oneLineSummary: tData.one_line_summary,
            shortDescription: tData.short_description,
            detailedDescription: tData.detailed_description,
            discussionPoints: tData.discussion_points,
            decisionsTaken: tData.decisions_taken,
            actionItems: tData.action_items,
            responsiblePerson: tData.responsible_person,
            targetDate: tData.target_date,
            nextSteps: tData.next_steps,
            remarks: tData.remarks,
          };
        } catch (e) {
          console.error("Failed to parse version template data:", e);
        }
      }

      const res = await fetch(`/api/meetings/${selectedMeeting.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        fetchMeetings();
        fetchMeetingDetails(selectedMeeting.id);
        setDetailTab("details");
      }
    } catch (err) {
      console.error("Failed to restore version:", err);
    }
  };

  // Export MOM to MS Word .doc
  const handleExportWord = (meeting: Meeting) => {
    const isTemplate = meeting.creation_method === "template";
    let contentHtml = "";

    if (isTemplate) {
      contentHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px;">
          <h1 style="color: #06b6d4; text-align: center; border-bottom: 2px solid #a855f7; padding-bottom: 10px; font-family: 'Outfit', sans-serif;">MINUTES OF MEETING</h1>
          <h2 style="color: #1e293b; text-align: center; margin-top: 5px;">${meeting.title}</h2>
          
          <div style="margin-top: 25px; margin-bottom: 25px; padding: 15px; background-color: #f8fafc; border-left: 4px solid #06b6d4; border-radius: 6px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 20%; font-weight: bold; padding: 6px 0; font-size: 13px;">Meeting ID:</td>
                <td style="padding: 6px 0; font-size: 13px;">${meeting.meeting_id}</td>
                <td style="width: 20%; font-weight: bold; padding: 6px 0; font-size: 13px;">Date & Time:</td>
                <td style="padding: 6px 0; font-size: 13px;">${new Date(meeting.meeting_date).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; padding: 6px 0; font-size: 13px;">Platform:</td>
                <td style="padding: 6px 0; font-size: 13px;">${meeting.platform || "N/A"}</td>
                <td style="font-weight: bold; padding: 6px 0; font-size: 13px;">Conducted By:</td>
                <td style="padding: 6px 0; font-size: 13px;">${meeting.conducted_by || "N/A"}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; padding: 6px 0; font-size: 13px;">Attendees:</td>
                <td style="padding: 6px 0; font-size: 13px;" colspan="3">${meeting.attendees || "N/A"}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; padding: 6px 0; font-size: 13px;">Absentees:</td>
                <td style="padding: 6px 0; font-size: 13px;" colspan="3">${meeting.absentees || "N/A"}</td>
              </tr>
            </table>
          </div>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">1. One-Line Summary</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">${meeting.one_line_summary || "N/A"}</p>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">2. Short Description</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${meeting.short_description || "N/A"}</p>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">3. Detailed Description</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${meeting.detailed_description || "N/A"}</p>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">4. Discussion Points</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${meeting.discussion_points || "N/A"}</p>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">5. Decisions Taken</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${meeting.decisions_taken || "N/A"}</p>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">6. Action Items & Execution Plan</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px;">Action Items</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px;">Responsible Person</th>
                <th style="border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px;">Target Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px; white-space: pre-wrap;">${meeting.action_items || "N/A"}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px;">${meeting.responsible_person || "N/A"}</td>
                <td style="border: 1px solid #cbd5e1; padding: 8px; font-size: 13px;">${meeting.target_date || "N/A"}</td>
              </tr>
            </tbody>
          </table>

          <h3 style="color: #a855f7; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 25px; font-family: 'Outfit', sans-serif;">7. Next Steps & Remarks</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <tr>
              <td style="width: 50%; border: 1px solid #cbd5e1; padding: 10px; vertical-align: top; background-color: #f8fafc;">
                <strong>Next Steps / Execution Plan:</strong><br/>
                <p style="font-size: 13px; line-height: 1.5; color: #334155; margin-top: 5px; white-space: pre-wrap;">${meeting.next_steps || "N/A"}</p>
              </td>
              <td style="width: 50%; border: 1px solid #cbd5e1; padding: 10px; vertical-align: top; background-color: #f8fafc;">
                <strong>Remarks:</strong><br/>
                <p style="font-size: 13px; line-height: 1.5; color: #334155; margin-top: 5px; white-space: pre-wrap;">${meeting.remarks || "N/A"}</p>
              </td>
            </tr>
          </table>
          
          <div style="margin-top: 40px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 10px;">
            Generated by AetherOps Meeting Management on ${new Date().toLocaleString()}
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px;">
          <h1 style="color: #06b6d4; text-align: center; border-bottom: 2px solid #a855f7; padding-bottom: 10px; font-family: 'Outfit', sans-serif;">MINUTES OF MEETING</h1>
          <h2 style="color: #1e293b; text-align: center; margin-top: 5px;">${meeting.title}</h2>
          <div style="margin-top: 20px; margin-bottom: 20px; padding: 15px; background-color: #f8fafc; border-left: 4px solid #06b6d4; border-radius: 6px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 25%; font-weight: bold; padding: 5px 0; font-size: 13px;">Meeting ID:</td>
                <td style="padding: 5px 0; font-size: 13px;">${meeting.meeting_id}</td>
                <td style="width: 25%; font-weight: bold; padding: 5px 0; font-size: 13px;">Date & Time:</td>
                <td style="padding: 5px 0; font-size: 13px;">${new Date(meeting.meeting_date).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; padding: 5px 0; font-size: 13px;">Platform:</td>
                <td style="padding: 5px 0; font-size: 13px;">${meeting.platform || "N/A"}</td>
                <td style="font-weight: bold; padding: 5px 0; font-size: 13px;">Conducted By:</td>
                <td style="padding: 5px 0; font-size: 13px;">${meeting.conducted_by || "N/A"}</td>
              </tr>
              <tr>
                <td style="font-weight: bold; padding: 5px 0; font-size: 13px;">Uploaded MOM File:</td>
                <td style="padding: 5px 0; font-size: 13px;" colspan="3">${meeting.file_name} (${(meeting.file_size / 1024).toFixed(1)} KB)</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">This MOM was created by uploading an external document file. Access the file in the AetherOps system at: <code>${meeting.file_path}</code>.</p>
        </div>
      `;
    }

    const htmlString = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <meta charset="utf-8">
        <title>${meeting.title}</title>
      </head>
      <body>
        ${contentHtml}
      </body>
      </html>
    `;

    const blob = new Blob(["\ufeff" + htmlString], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${meeting.meeting_id}_MOM.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print MOM Method
  const handlePrintMOM = (meeting: Meeting) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const isTemplate = meeting.creation_method === "template";
    let contentHtml = "";

    if (isTemplate) {
      contentHtml = `
        <div class="print-container">
          <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 25px;">
            <h1 style="margin: 0; font-size: 26px; color: #0f172a; font-family: 'Outfit', sans-serif;">MINUTES OF MEETING</h1>
            <h2 style="margin: 5px 0 0 0; font-size: 18px; color: #475569; font-weight: normal;">${meeting.title}</h2>
          </div>
          
          <div class="meta-section">
            <table>
              <tr>
                <td><strong>Meeting ID:</strong></td>
                <td>${meeting.meeting_id}</td>
                <td><strong>Date & Time:</strong></td>
                <td>${new Date(meeting.meeting_date).toLocaleString()}</td>
              </tr>
              <tr>
                <td><strong>Platform:</strong></td>
                <td>${meeting.platform || "N/A"}</td>
                <td><strong>Conducted By:</strong></td>
                <td>${meeting.conducted_by || "N/A"}</td>
              </tr>
              <tr>
                <td><strong>Attendees:</strong></td>
                <td colspan="3">${meeting.attendees || "N/A"}</td>
              </tr>
              <tr>
                <td><strong>Absentees:</strong></td>
                <td colspan="3">${meeting.absentees || "N/A"}</td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h3>1. One-Line Summary</h3>
            <p>${meeting.one_line_summary || "N/A"}</p>
          </div>

          <div class="section">
            <h3>2. Short Description</h3>
            <p style="white-space: pre-wrap;">${meeting.short_description || "N/A"}</p>
          </div>

          <div class="section">
            <h3>3. Detailed Description</h3>
            <p style="white-space: pre-wrap;">${meeting.detailed_description || "N/A"}</p>
          </div>

          <div class="section">
            <h3>4. Discussion Points</h3>
            <p style="white-space: pre-wrap;">${meeting.discussion_points || "N/A"}</p>
          </div>

          <div class="section">
            <h3>5. Decisions Taken</h3>
            <p style="white-space: pre-wrap;">${meeting.decisions_taken || "N/A"}</p>
          </div>

          <div class="section">
            <h3>6. Action Items & Execution Plan</h3>
            <table>
              <thead>
                <tr>
                  <th>Action Items</th>
                  <th>Responsible Person</th>
                  <th>Target Date</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="white-space: pre-wrap;">${meeting.action_items || "N/A"}</td>
                  <td>${meeting.responsible_person || "N/A"}</td>
                  <td>${meeting.target_date || "N/A"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <h3>7. Next Steps & Remarks</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; vertical-align: top; border: 1px solid #cbd5e1; padding: 10px;">
                  <strong>Next Steps / Execution Plan:</strong>
                  <p style="white-space: pre-wrap; margin-top: 5px; font-size: 13px;">${meeting.next_steps || "N/A"}</p>
                </td>
                <td style="width: 50%; vertical-align: top; border: 1px solid #cbd5e1; padding: 10px;">
                  <strong>Remarks:</strong>
                  <p style="white-space: pre-wrap; margin-top: 5px; font-size: 13px;">${meeting.remarks || "N/A"}</p>
                </td>
              </tr>
            </table>
          </div>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="print-container">
          <div style="text-align: center; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 25px;">
            <h1 style="margin: 0; font-size: 26px; color: #0f172a; font-family: 'Outfit', sans-serif;">MINUTES OF MEETING</h1>
            <h2 style="margin: 5px 0 0 0; font-size: 18px; color: #475569; font-weight: normal;">${meeting.title}</h2>
          </div>
          
          <div class="meta-section">
            <table>
              <tr>
                <td><strong>Meeting ID:</strong></td>
                <td>${meeting.meeting_id}</td>
                <td><strong>Date & Time:</strong></td>
                <td>${new Date(meeting.meeting_date).toLocaleString()}</td>
              </tr>
              <tr>
                <td><strong>Platform:</strong></td>
                <td>${meeting.platform || "N/A"}</td>
                <td><strong>Conducted By:</strong></td>
                <td>${meeting.conducted_by || "N/A"}</td>
              </tr>
              <tr>
                <td><strong>Uploaded File:</strong></td>
                <td colspan="3">${meeting.file_name} (${(meeting.file_size / 1024).toFixed(1)} KB)</td>
              </tr>
            </table>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #334155;">This MOM was created by uploading an external document file: <strong>${meeting.file_name}</strong></p>
        </div>
      `;
    }

    printWindow.document.write(`
      <html>
      <head>
        <title>Print MOM - ${meeting.meeting_id}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #333; }
          .print-container { max-width: 800px; margin: auto; }
          .meta-section { margin: 20px 0; background: #f8fafc; border: 1px solid #cbd5e1; padding: 15px; border-radius: 4px; }
          .meta-section table { width: 100%; border-collapse: collapse; }
          .meta-section td { padding: 4px 6px; font-size: 13px; }
          .section { margin: 20px 0; }
          h3 { border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #0f172a; font-size: 15px; margin-bottom: 8px; }
          p { font-size: 13px; line-height: 1.5; color: #334155; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #f1f5f9; font-weight: bold; }
          @media print {
            body { padding: 0; }
            .meta-section { background: none; }
            th { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${contentHtml}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Stat calculations
  const stats = {
    total: meetings.length,
    draft: meetings.filter(m => m.status === "Draft").length,
    submitted: meetings.filter(m => m.status === "Submitted").length,
    approved: meetings.filter(m => m.status === "Approved").length,
    closed: meetings.filter(m => m.status === "Closed").length,
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "Submitted":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "Approved":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "Closed":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-foreground">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-orbitron font-bold tracking-tight text-blue-600 dark:text-blue-400">
            AETHEROPS MEETING CONTROL
          </h1>
          <p className="text-text-dim text-sm mt-1">
            Centrally coordinate operations, document details, audit histories, and export Minutes of Meetings (MOM).
          </p>
        </div>
        <Button
          onClick={() => {
            setFormData(initialFormState);
            setUploadFile(null);
            setTempMeetingId(null);
            setCreationMethod(null);
            setWizardStep(1);
            setFormError("");
            setAutoSaveStatus("");
            setShowCreateWizard(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] transition-all cursor-pointer self-start md:self-center"
        >
          <Plus className="w-4 h-4 mr-2" /> New Meeting MOM
        </Button>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Meetings", value: stats.total, color: "from-blue-500/10 to-indigo-500/5", border: "border-blue-500/20", icon: FileText, iconColor: "text-blue-500 dark:text-blue-400" },
          { label: "Draft Stage", value: stats.draft, color: "from-yellow-500/10 to-amber-500/5", border: "border-yellow-500/20", icon: History, iconColor: "text-yellow-400" },
          { label: "Awaiting Review", value: stats.submitted, color: "from-cyan-500/10 to-sky-500/5", border: "border-cyan-500/20", icon: Clock, iconColor: "text-cyan-400" },
          { label: "Approved MOMs", value: stats.approved, color: "from-green-500/10 to-emerald-500/5", border: "border-green-500/20", icon: CheckCircle2, iconColor: "text-green-400" },
          { label: "Closed Sessions", value: stats.closed, color: "from-purple-500/10 to-fuchsia-500/5", border: "border-purple-500/20", icon: FileSpreadsheet, iconColor: "text-purple-400" },
        ].map((stat, idx) => (
          <div key={idx} className={cn("glass-panel p-4 rounded-2xl border flex flex-col justify-between shadow-lg", stat.color, stat.border)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-widest text-text-dim">{stat.label}</span>
              <stat.icon className={cn("w-4 h-4", stat.iconColor)} />
            </div>
            <span className="text-3xl font-orbitron font-bold mt-2">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side: Filter Navigator */}
        <div className="space-y-4">
          <form onSubmit={handleSearchSubmit} className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-dim flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-cyan-400" /> Query Directory
            </h3>
            
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search MOM content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all placeholder:text-white/20"
              />
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-text-dim font-medium text-[10px]">Session Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-400"
                >
                  <option value="" className="bg-[#0b0c16]">-- All Statuses --</option>
                  <option value="Draft" className="bg-[#0b0c16]">Draft</option>
                  <option value="Submitted" className="bg-[#0b0c16]">Submitted</option>
                  <option value="Approved" className="bg-[#0b0c16]">Approved</option>
                  <option value="Closed" className="bg-[#0b0c16]">Closed</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-text-dim font-medium text-[10px]">Meeting Platform</label>
                <select
                  value={platformFilter}
                  onChange={(e) => setPlatformFilter(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-400"
                >
                  <option value="" className="bg-[#0b0c16]">-- All Platforms --</option>
                  <option value="Zoom" className="bg-[#0b0c16]">Zoom</option>
                  <option value="Microsoft Teams" className="bg-[#0b0c16]">Microsoft Teams</option>
                  <option value="Google Meet" className="bg-[#0b0c16]">Google Meet</option>
                  <option value="WebEx" className="bg-[#0b0c16]">WebEx</option>
                  <option value="Offline" className="bg-[#0b0c16]">Offline</option>
                  <option value="Others" className="bg-[#0b0c16]">Others</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-text-dim font-medium text-[10px]">Date of Meeting</label>
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-400 text-white"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  type="submit"
                  className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 py-1.5 font-bold cursor-pointer text-xs"
                >
                  Apply Filters
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("");
                    setPlatformFilter("");
                    setDateFilter("");
                    setMeetings([]);
                    setTimeout(fetchMeetings, 0);
                  }}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 py-1.5 font-bold cursor-pointer text-xs"
                >
                  Reset
                </Button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Side: Meeting Grid List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="text-xs text-text-dim font-orbitron">SYNCING SYSTEM RECORDS...</span>
              </div>
            ) : meetings.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold">No Meeting MOMs Registered</h3>
                  <p className="text-text-dim text-xs mt-1 max-w-sm">
                    No matching logs found in AetherOps. Create a new MOM template or upload a document artifact to initialize.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {meetings.map((meeting) => (
                  <div
                    key={meeting.id}
                    onClick={() => setSelectedMeetingId(meeting.id)}
                    className={cn(
                      "p-5 hover:bg-white/5 transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-2",
                      selectedMeetingId === meeting.id ? "border-cyan-400 bg-white/5" : "border-transparent"
                    )}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">
                          {meeting.meeting_id}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-text-dim/80 bg-white/5 px-2 py-0.5 rounded flex items-center gap-1">
                          {meeting.creation_method === "upload" ? (
                            <>
                              <UploadCloud className="w-2.5 h-2.5" /> Upload Method
                            </>
                          ) : (
                            <>
                              <FileText className="w-2.5 h-2.5" /> Template Mode
                            </>
                          )}
                        </span>
                        {meeting.platform && (
                          <span className="text-[10px] text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded flex items-center gap-1">
                            <Video className="w-2.5 h-2.5" /> {meeting.platform}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold truncate text-white hover:text-cyan-400 transition-colors">
                        {meeting.title}
                      </h3>
                      <p className="text-xs text-text-dim truncate max-w-xl">
                        {meeting.one_line_summary || meeting.file_name || "No summary provided."}
                      </p>
                      <div className="text-[10px] text-text-dim/60 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-cyan-500/60" /> {new Date(meeting.meeting_date).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-purple-500/60" /> {new Date(meeting.meeting_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span>
                          Conducted by: <strong>{meeting.conducted_by || "System"}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
                      <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-[inset_0_0_8px_rgba(255,255,255,0.02)] capitalize", getStatusBadgeClass(meeting.status))}>
                        {meeting.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-white/30" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Meeting Drawer */}
      {selectedMeetingId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex justify-end transition-opacity duration-300">
          <div className="w-full max-w-3xl bg-[#06070d]/95 border-l border-white/10 h-full flex flex-col shadow-2xl relative animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded">
                    {selectedMeeting?.meeting_id}
                  </span>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize", selectedMeeting && getStatusBadgeClass(selectedMeeting.status))}>
                    {selectedMeeting?.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold font-orbitron text-white truncate max-w-md" title={selectedMeeting?.title}>
                  {selectedMeeting?.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedMeetingId(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 text-text-dim hover:text-white" />
                </button>
              </div>
            </div>

            {/* Quick Actions Bar */}
            {selectedMeeting && (
              <div className="px-6 py-3 border-b border-white/5 bg-white/5 flex flex-wrap gap-2 justify-between items-center shrink-0">
                <div className="flex gap-2">
                  {selectedMeeting.creation_method === "upload" ? (
                    <a
                      href={selectedMeeting.file_path}
                      download
                      className="inline-flex items-center px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download MOM File
                    </a>
                  ) : (
                    <>
                      <Button
                        onClick={() => handleExportWord(selectedMeeting)}
                        className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl py-1.5 font-bold cursor-pointer text-xs"
                      >
                        <FileDown className="w-3.5 h-3.5 mr-1.5" /> Export to Word
                      </Button>
                      <Button
                        onClick={() => handlePrintMOM(selectedMeeting)}
                        className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-xl py-1.5 font-bold cursor-pointer text-xs"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1.5" /> Print MOM
                      </Button>
                    </>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  {/* Status update options */}
                  {selectedMeeting.status === "Draft" && (
                    <Button
                      onClick={() => handleUpdateStatus(selectedMeeting, "Submitted")}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold border border-blue-500/20 text-xs py-1.5"
                    >
                      Submit MOM
                    </Button>
                  )}
                  {selectedMeeting.status === "Submitted" && (profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "ultra_super_admin") && (
                    <>
                      <Button
                        onClick={() => handleUpdateStatus(selectedMeeting, "Approved")}
                        className="bg-green-500 hover:bg-green-400 text-slate-950 font-bold text-xs py-1.5"
                      >
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleUpdateStatus(selectedMeeting, "Draft")}
                        className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs py-1.5"
                      >
                        Return to Draft
                      </Button>
                    </>
                  )}
                  {selectedMeeting.status === "Approved" && (profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "ultra_super_admin") && (
                    <Button
                      onClick={() => handleUpdateStatus(selectedMeeting, "Closed")}
                      className="bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold text-xs py-1.5"
                    >
                      Close Session
                    </Button>
                  )}

                  {/* Edit/Delete */}
                  {selectedMeeting.status === "Draft" && (
                    <Button
                      onClick={() => handleEditClick(selectedMeeting)}
                      className="bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs py-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                  )}
                  <Button
                    onClick={() => handleDeleteClick(selectedMeeting.id)}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs py-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Tabs Selector */}
            <div className="flex border-b border-white/10 bg-black/20 shrink-0 overflow-x-auto">
              {[
                { id: "details",       label: "MOM Details",                                          icon: FileText },
                { id: "versions",      label: `Version History (${selectedMeeting?.versions?.length || 0})`, icon: History },
                { id: "audit",         label: "Audit Logs",                                           icon: BookOpen },
                { id: "timeline",      label: "Timeline",                                             icon: Layers },
                { id: "notifications", label: "Notifications",                                        icon: Bell },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id as any)}
                  className={cn(
                    "flex-shrink-0 flex-1 min-w-[90px] py-3 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 cursor-pointer transition-all",
                    detailTab === tab.id
                      ? "border-cyan-400 text-cyan-400 bg-white/5"
                      : "border-transparent text-text-dim hover:text-white"
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Drawer Body Scroll */}
            <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-6">
              {loadingDetails ? (
                <div className="h-full flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                  <span className="text-[10px] text-text-dim font-orbitron">LOADING DETAIL METADATA...</span>
                </div>
              ) : selectedMeeting && (
                <>
                  {detailTab === "details" && (
                    <div className="space-y-6">
                      {/* Grid metadata */}
                      <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/5 text-xs">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-text-dim">Date & Time</span>
                          <p className="mt-0.5 font-semibold text-white">
                            {new Date(selectedMeeting.meeting_date).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-text-dim">Meeting Platform</span>
                          <p className="mt-0.5 font-semibold text-white">
                            {selectedMeeting.platform || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-text-dim">Conducted By</span>
                          <p className="mt-0.5 font-semibold text-white">
                            {selectedMeeting.conducted_by || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-bold text-text-dim">System Version</span>
                          <p className="mt-0.5 font-semibold text-white">
                            v{selectedMeeting.version}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[9px] uppercase font-bold text-text-dim">Attendees</span>
                          <p className="mt-0.5 text-white whitespace-pre-wrap">{selectedMeeting.attendees || "None logged."}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[9px] uppercase font-bold text-text-dim">Absentees</span>
                          <p className="mt-0.5 text-white whitespace-pre-wrap">{selectedMeeting.absentees || "None logged."}</p>
                        </div>
                      </div>

                      {selectedMeeting.creation_method === "upload" ? (
                        <div className="glass-panel p-5 rounded-xl border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-cyan-400/10 rounded-lg flex items-center justify-center text-cyan-400">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-sm">{selectedMeeting.file_name}</h4>
                              <p className="text-[10px] text-text-dim mt-0.5">
                                Size: {(selectedMeeting.file_size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>
                          <a
                            href={selectedMeeting.file_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            View File
                          </a>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">One-Line Summary</h4>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-sm text-white">
                              {selectedMeeting.one_line_summary || "N/A"}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Short Description (9 lines max)</h4>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white whitespace-pre-wrap leading-relaxed">
                              {selectedMeeting.short_description || "N/A"}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Detailed Description (20 lines max)</h4>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white whitespace-pre-wrap leading-relaxed">
                              {selectedMeeting.detailed_description || "N/A"}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Discussion Points</h4>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white whitespace-pre-wrap leading-relaxed">
                              {selectedMeeting.discussion_points || "N/A"}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Decisions Taken</h4>
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-xs text-white whitespace-pre-wrap leading-relaxed">
                              {selectedMeeting.decisions_taken || "N/A"}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1 md:col-span-2">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Action Items</h4>
                              <div className="p-3 bg-white/5 rounded-xl border border-white/5 h-24 overflow-y-auto text-xs text-white whitespace-pre-wrap leading-relaxed">
                                {selectedMeeting.action_items || "N/A"}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Responsible Person</h4>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/5 text-xs text-white truncate">
                                  {selectedMeeting.responsible_person || "N/A"}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Target Date</h4>
                                <div className="p-2.5 bg-white/5 rounded-xl border border-white/5 text-xs text-white truncate">
                                  {selectedMeeting.target_date || "N/A"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Next Steps / Execution Plan</h4>
                              <div className="p-3 bg-white/5 rounded-xl border border-white/5 h-20 overflow-y-auto text-xs text-white whitespace-pre-wrap">
                                {selectedMeeting.next_steps || "N/A"}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-dim">Remarks</h4>
                              <div className="p-3 bg-white/5 rounded-xl border border-white/5 h-20 overflow-y-auto text-xs text-white whitespace-pre-wrap">
                                {selectedMeeting.remarks || "N/A"}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-white/8 overflow-hidden">
                        {/* Section Header */}
                        <button
                          onClick={() => setVirtualSectionOpen(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-blue-500/5 hover:bg-blue-500/10 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                              <Video className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                            </div>
                            <span className="text-xs font-bold font-orbitron uppercase tracking-wider text-blue-500 dark:text-blue-400">Virtual Meeting Details</span>
                          </div>
                          {virtualSectionOpen ? <ChevronUp className="w-4 h-4 text-text-dim" /> : <ChevronDown className="w-4 h-4 text-text-dim" />}
                        </button>

                        {virtualSectionOpen && (
                          <div className="p-4 space-y-4 bg-black/20">
                            {/* Meeting Mode */}
                            <div className="space-y-2">
                              <label className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Meeting Mode</label>
                              <div className="flex gap-2">
                                {([
                                  { id: "physical", label: "Physical",  icon: MapPin },
                                  { id: "virtual",  label: "Virtual",   icon: Wifi },
                                  { id: "hybrid",   label: "Hybrid",    icon: Radio },
                                ] as { id: MeetingMode; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                                  <button
                                    key={id}
                                    onClick={() => saveVirtualData({ ...virtualData, mode: id })}
                                    className={cn(
                                      "flex-1 flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl border text-[10px] font-bold cursor-pointer transition-all",
                                      virtualData.mode === id
                                        ? id === "physical"
                                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                                          : id === "virtual"
                                          ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                                          : "bg-purple-500/15 border-purple-500/40 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                                        : "bg-white/3 border-white/8 text-text-dim hover:border-white/20"
                                    )}
                                  >
                                    <Icon className="w-4 h-4" />
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Virtual / Hybrid fields */}
                            {(virtualData.mode === "virtual" || virtualData.mode === "hybrid") && (
                              <div className="space-y-3">
                                {/* Meeting Link */}
                                <div className="space-y-1.5">
                                  <label className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Meeting Link URL</label>
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
                                      <input
                                        type="url"
                                        placeholder="https://meet.example.com/room"
                                        value={virtualData.meetingLink}
                                        onChange={e => saveVirtualData({ ...virtualData, meetingLink: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all placeholder:text-white/20 text-white"
                                      />
                                    </div>
                                    <Button
                                      onClick={() => handleCopyLink(virtualData.meetingLink)}
                                      disabled={!virtualData.meetingLink}
                                      className={cn(
                                        "shrink-0 text-xs px-3 py-1.5 border font-bold cursor-pointer transition-all",
                                        copiedLink
                                          ? "bg-green-500/15 border-green-500/30 text-green-400"
                                          : "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                                      )}
                                    >
                                      {copiedLink ? <><Check className="w-3 h-3 mr-1" />Copied!</> : <><Copy className="w-3 h-3 mr-1" />Copy</>}
                                    </Button>
                                  </div>
                                </div>

                                {/* Room ID */}
                                <div className="space-y-1.5">
                                  <label className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Meeting Room ID</label>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="Auto-generated Room ID"
                                      value={virtualData.roomId}
                                      onChange={e => saveVirtualData({ ...virtualData, roomId: e.target.value })}
                                      className="flex-1 bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all placeholder:text-white/20 text-white font-mono"
                                    />
                                    <Button
                                      onClick={() => saveVirtualData({ ...virtualData, roomId: generateRoomId() })}
                                      className="shrink-0 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 text-xs px-3 py-1.5 font-bold cursor-pointer"
                                    >
                                      <RefreshCw className="w-3 h-3 mr-1" />Generate
                                    </Button>
                                  </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-1.5">
                                  <label className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Meeting Password <span className="text-white/30 font-normal normal-case tracking-normal">(Optional)</span></label>
                                  <input
                                    type="text"
                                    placeholder="Enter room password"
                                    value={virtualData.password}
                                    onChange={e => saveVirtualData({ ...virtualData, password: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder:text-text-dim text-foreground"
                                  />
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 pt-1">
                                  <Button
                                    onClick={() => virtualData.meetingLink && window.open(virtualData.meetingLink, "_blank")}
                                    disabled={!virtualData.meetingLink}
                                    className="flex-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-500 dark:text-blue-400 font-bold text-xs py-2 cursor-pointer shadow-[0_0_15px_rgba(37,99,235,0.15)] hover:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all"
                                  >
                                    <PlayCircle className="w-3.5 h-3.5 mr-1.5" />Join Meeting
                                  </Button>
                                  <Button
                                    onClick={() => handleCopyLink(virtualData.meetingLink)}
                                    disabled={!virtualData.meetingLink}
                                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground dark:text-white font-bold text-xs py-2 cursor-pointer transition-all"
                                  >
                                    <Copy className="w-3.5 h-3.5 mr-1.5" />{copiedLink ? "Copied!" : "Copy Meeting Link"}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Physical mode note */}
                            {virtualData.mode === "physical" && (
                              <div className="flex items-center gap-2 p-3 bg-emerald-500/8 rounded-xl border border-emerald-500/15">
                                <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                                <p className="text-xs text-emerald-400/80">This is a physical in-person meeting. No virtual link required.</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ── NEW: Attendance Tracking Section ──────────────────────────────── */}
                      <div className="rounded-2xl border border-white/8 overflow-hidden">
                        <button
                          onClick={() => setAttendanceSectionOpen(v => !v)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-blue-500/5 hover:bg-blue-500/10 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                              <Users2 className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                            </div>
                            <span className="text-xs font-bold font-orbitron uppercase tracking-wider text-blue-500 dark:text-blue-400">Attendance Tracking</span>
                          </div>
                          {attendanceSectionOpen ? <ChevronUp className="w-4 h-4 text-text-dim" /> : <ChevronDown className="w-4 h-4 text-text-dim" />}
                        </button>

                        {attendanceSectionOpen && (
                          <div className="p-4 space-y-4 bg-black/20">
                            {/* Stats Row */}
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                { label: "Invited",    value: attendanceData.totalInvited, color: "text-blue-500 dark:text-blue-400",   bg: "bg-blue-500/10",    border: "border-blue-500/20" },
                                { label: "Joined",     value: attendanceData.totalJoined,  color: "text-green-500 dark:text-green-400",  bg: "bg-green-500/10",   border: "border-green-500/20" },
                                { label: "Attendance", value: `${getAttendancePct()}%`,    color: "text-blue-500 dark:text-blue-400",   bg: "bg-blue-500/10",    border: "border-blue-500/20" },
                              ].map(stat => (
                                <div key={stat.label} className={cn("rounded-xl p-3 border flex flex-col items-center justify-center", stat.bg, stat.border)}>
                                  <span className={cn("text-xl font-orbitron font-bold", stat.color)}>{stat.value}</span>
                                  <span className="text-[9px] uppercase font-bold tracking-wider text-text-dim mt-0.5">{stat.label}</span>
                                </div>
                              ))}
                            </div>

                            {/* Attendance Bar */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] text-text-dim">
                                <span>Attendance Rate</span>
                                <span className="font-bold text-blue-500 dark:text-blue-400">{getAttendancePct()}%</span>
                              </div>
                              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                  style={{ width: `${getAttendancePct()}%` }}
                                />
                              </div>
                            </div>

                            {/* Invited / Joined Inputs */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Total Invited</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={attendanceData.totalInvited}
                                  onChange={e => saveAttendanceData({ ...attendanceData, totalInvited: Math.max(0, parseInt(e.target.value) || 0) })}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Total Joined</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={attendanceData.totalJoined}
                                  onChange={e => saveAttendanceData({ ...attendanceData, totalJoined: Math.max(0, parseInt(e.target.value) || 0) })}
                                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-xs outline-none focus:ring-1 focus:ring-green-500/30 focus:border-green-400 transition-all text-white"
                                />
                              </div>
                            </div>

                            {/* Participant Activity Log */}
                            <div className="space-y-2">
                              <h5 className="text-[9px] uppercase font-bold tracking-widest text-text-dim">Participant Activity Log</h5>

                              {/* Add Entry Row */}
                              <div className="grid grid-cols-3 gap-2">
                                <input
                                  type="text"
                                  placeholder="Name"
                                  value={newParticipant.name}
                                  onChange={e => setNewParticipant(p => ({ ...p, name: e.target.value }))}
                                  className="bg-black/40 border border-white/10 rounded-xl py-1.5 px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-white placeholder:text-white/20"
                                />
                                <input
                                  type="time"
                                  placeholder="Join Time"
                                  value={newParticipant.joinTime}
                                  onChange={e => setNewParticipant(p => ({ ...p, joinTime: e.target.value }))}
                                  className="bg-black/40 border border-white/10 rounded-xl py-1.5 px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-white"
                                />
                                <input
                                  type="time"
                                  placeholder="Leave Time"
                                  value={newParticipant.leaveTime}
                                  onChange={e => setNewParticipant(p => ({ ...p, leaveTime: e.target.value }))}
                                  className="bg-black/40 border border-white/10 rounded-xl py-1.5 px-2 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-400 transition-all text-white"
                                />
                              </div>
                              <Button
                                onClick={handleAddParticipantLog}
                                disabled={!newParticipant.name}
                                className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-xs font-bold py-1.5 cursor-pointer transition-all"
                              >
                                <LogIn className="w-3 h-3 mr-1.5" />Add Participant
                              </Button>

                              {attendanceData.participantLogs.length > 0 ? (
                                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                                  <div className="grid grid-cols-4 gap-2 text-[9px] uppercase font-bold tracking-wider text-text-dim px-2">
                                    <span className="col-span-2">Participant</span>
                                    <span>Join Time</span>
                                    <span>Leave Time</span>
                                  </div>
                                  {attendanceData.participantLogs.map((log, idx) => (
                                    <div key={idx} className="grid grid-cols-4 gap-2 items-center bg-white/3 rounded-lg px-2 py-1.5 border border-white/5 group">
                                      <span className="col-span-2 text-xs text-white font-semibold truncate flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                                        {log.name}
                                      </span>
                                      <span className="text-[10px] text-cyan-400 font-mono">{log.joinTime || "—"}</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-purple-400 font-mono flex-1">{log.leaveTime || "—"}</span>
                                        <button onClick={() => handleRemoveParticipantLog(idx)} className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all cursor-pointer">
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-text-dim/50 text-center py-3">No participant logs recorded yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {/* ──────────────────────────────────────────────────────────────────── */}
                    </div>
                  )}

                  {detailTab === "versions" && (
                    <div className="space-y-4">
                      {selectedMeeting.versions.length === 0 ? (
                        <p className="text-center text-text-dim text-xs py-8">No historical versions stored for this session.</p>
                      ) : (
                        <div className="relative border-l border-white/10 pl-6 ml-3 space-y-6">
                          {selectedMeeting.versions.map((ver) => (
                            <div key={ver.id} className="relative">
                              {/* Dot */}
                              <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-sn-dark flex items-center justify-center shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                              
                              <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-2.5">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <span className="text-xs font-bold text-white">Version v{ver.version}</span>
                                  <span className="text-[10px] text-text-dim/70">{new Date(ver.created_at).toLocaleString()}</span>
                                </div>
                                <div className="text-[11px] text-text-dim bg-white/5 p-2 rounded border border-white/5 font-mono">
                                  Change log: <strong>{ver.change_summary}</strong>
                                </div>
                                <p className="text-xs text-text-dim/80">
                                  Updated by: <strong>{ver.updated_by_name}</strong>
                                </p>
                                
                                {selectedMeeting.status === "Draft" && (
                                  <Button
                                    onClick={() => handleRestoreVersion(ver)}
                                    className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 py-1 px-3 text-[10px] font-bold cursor-pointer transition-all"
                                  >
                                    Restore to v{ver.version}
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === "audit" && (
                    <div className="space-y-4">
                      {selectedMeeting.auditLogs.length === 0 ? (
                        <p className="text-center text-text-dim text-xs py-8">No audit logs saved.</p>
                      ) : (
                        <div className="relative border-l border-white/10 pl-6 ml-3 space-y-6">
                          {selectedMeeting.auditLogs.map((log) => (
                            <div key={log.id} className="relative">
                              <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-purple-500 border-2 border-sn-dark flex items-center justify-center shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                              
                              <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-1.5">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <span className="text-xs font-bold text-white">{log.action}</span>
                                  <span className="text-[10px] text-text-dim/70">{new Date(log.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-xs text-text-dim/90">{log.details}</p>
                                <span className="text-[10px] text-text-dim/50">
                                  Performed by: <strong>{log.performed_by_name}</strong>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── NEW: Meeting Timeline Tab ──────────────────────────────────────── */}
                  {detailTab === "timeline" && (
                    <div className="space-y-6">
                      {/* Timeline */}
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-4 flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-cyan-400" />Meeting Timeline
                        </h3>
                        <div className="relative border-l-2 border-white/8 pl-6 ml-3 space-y-5">
                          {getMeetingTimeline().map((milestone, idx) => {
                            const Icon = milestone.icon;
                            return (
                              <div key={milestone.key} className="relative">
                                {/* Connector dot */}
                                <div
                                  className={cn(
                                    "absolute -left-[31px] top-2.5 w-4 h-4 rounded-full border-2 border-sn-dark flex items-center justify-center transition-all",
                                    milestone.done
                                      ? "bg-current"
                                      : "bg-white/5"
                                  )}
                                  style={milestone.done ? { color: milestone.glowColor.replace("rgba", "").replace(")", "").replace("(", "").split(",").slice(0, 3).join(","), boxShadow: `0 0 10px ${milestone.glowColor}`, background: milestone.glowColor } : {}}
                                />

                                <div className={cn(
                                  "glass-panel p-3.5 rounded-xl border space-y-2 transition-all",
                                  milestone.done ? "border-white/10" : "border-white/5 opacity-60"
                                )}>
                                  <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                      <Icon className={cn("w-4 h-4", milestone.done ? milestone.color : "text-text-dim")} />
                                      <span className={cn("text-xs font-bold", milestone.done ? "text-white" : "text-text-dim")}>
                                        {milestone.label}
                                      </span>
                                      {milestone.done && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">DONE</span>
                                      )}
                                    </div>
                                    {milestone.timestamp ? (
                                      <span className="text-[10px] text-text-dim/70 font-mono">
                                        {new Date(milestone.timestamp).toLocaleString()}
                                      </span>
                                    ) : (
                                      !milestone.done && (
                                        <Button
                                          onClick={() => markTimelineMilestone(milestone.key)}
                                          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] px-2 py-1 font-bold cursor-pointer transition-all"
                                        >
                                          <Timer className="w-3 h-3 mr-1" />Mark Now
                                        </Button>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Recording Management */}
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-dim flex items-center gap-2">
                          <Film className="w-3.5 h-3.5 text-purple-400" />Recording Management
                        </h3>

                        {recordingData.fileName ? (
                          <div className="glass-panel p-4 rounded-xl border border-purple-500/20 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400 shrink-0">
                                <Film className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{recordingData.fileName}</p>
                                <p className="text-[10px] text-text-dim mt-0.5">
                                  {(recordingData.fileSize / (1024 * 1024)).toFixed(2)} MB
                                  {recordingData.uploadedAt && ` · Uploaded ${new Date(recordingData.uploadedAt).toLocaleDateString()}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <a
                                href={recordingData.fileUrl}
                                download={recordingData.fileName}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />Download Recording
                              </a>
                              <Button
                                onClick={() => saveRecordingData(defaultRecording)}
                                className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs py-1.5 px-3 font-bold cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-white/15 rounded-xl p-6 relative group hover:border-purple-500/40 transition-all bg-black/20">
                            <input
                              type="file"
                              accept="video/*,audio/*"
                              onChange={e => { if (e.target.files?.[0]) handleRecordingUpload(e.target.files[0]); }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            {recordingUploading ? (
                              <div className="flex flex-col items-center gap-2">
                                <RefreshCw className="w-7 h-7 text-purple-400 animate-spin" />
                                <span className="text-xs text-text-dim">Processing recording...</span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-center">
                                <Film className="w-7 h-7 text-white/20 group-hover:text-purple-400 transition-colors" />
                                <div>
                                  <span className="text-xs font-semibold block">Upload Meeting Recording</span>
                                  <span className="text-[10px] text-text-dim block mt-0.5">MP4, WebM, MOV, AVI supported</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* ── ──────────────────────────────────────────────────────────────── */}

                  {/* ── NEW: Meeting Notifications Tab ────────────────────────────────── */}
                  {detailTab === "notifications" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Bell className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-dim">Meeting Notifications</h3>
                      </div>

                      <p className="text-[10px] text-text-dim/70 bg-white/3 rounded-xl px-3 py-2 border border-white/5">
                        Configure which notification events are active for this meeting. Toggle to enable or disable each type.
                      </p>

                      <div className="space-y-2">
                        {([
                          {
                            key: "scheduled" as NotificationKey,
                            label: "Meeting Scheduled",
                            description: "Notify participants when the meeting is created and scheduled.",
                            icon: BellRing,
                            color: "cyan",
                          },
                          {
                            key: "reminder" as NotificationKey,
                            label: "Meeting Reminder",
                            description: "Send a reminder 30 minutes before the meeting starts.",
                            icon: Timer,
                            color: "yellow",
                          },
                          {
                            key: "started" as NotificationKey,
                            label: "Meeting Started",
                            description: "Alert all participants when the meeting begins.",
                            icon: PlayCircle,
                            color: "green",
                          },
                          {
                            key: "momPending" as NotificationKey,
                            label: "MOM Pending",
                            description: "Remind the host when MOM is yet to be uploaded after meeting ends.",
                            icon: ClipboardCheck,
                            color: "orange",
                          },
                          {
                            key: "completed" as NotificationKey,
                            label: "Meeting Completed",
                            description: "Notify all participants when the meeting is closed.",
                            icon: CheckSquare,
                            color: "purple",
                          },
                        ]).map(({ key, label, description, icon: Icon, color }) => {
                          const isOn = notifications[key];
                          const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
                            cyan:   { bg: "bg-cyan-500/10",   border: "border-cyan-500/25",   text: "text-cyan-400",   dot: "bg-cyan-400"   },
                            yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/25", text: "text-yellow-400", dot: "bg-yellow-400" },
                            green:  { bg: "bg-green-500/10",  border: "border-green-500/25",  text: "text-green-400",  dot: "bg-green-400"  },
                            orange: { bg: "bg-orange-500/10", border: "border-orange-500/25", text: "text-orange-400", dot: "bg-orange-400" },
                            purple: { bg: "bg-purple-500/10", border: "border-purple-500/25", text: "text-purple-400", dot: "bg-purple-400" },
                          };
                          const c = colorMap[color];
                          return (
                            <div
                              key={key}
                              className={cn(
                                "flex items-center gap-3 p-3.5 rounded-xl border transition-all",
                                isOn ? cn(c.bg, c.border) : "bg-white/3 border-white/8 opacity-60"
                              )}
                            >
                              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", isOn ? c.bg : "bg-white/5")}>
                                <Icon className={cn("w-4 h-4", isOn ? c.text : "text-text-dim")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={cn("text-xs font-bold", isOn ? "text-white" : "text-text-dim")}>{label}</span>
                                  <div className={cn("w-1.5 h-1.5 rounded-full", isOn ? cn(c.dot, "shadow-sm") : "bg-white/20")} />
                                  <span className={cn("text-[9px] font-bold", isOn ? c.text : "text-text-dim/50")}>{isOn ? "ACTIVE" : "OFF"}</span>
                                </div>
                                <p className="text-[10px] text-text-dim/70 mt-0.5 leading-relaxed">{description}</p>
                              </div>
                              <button
                                onClick={() => saveNotifications({ ...notifications, [key]: !isOn })}
                                className={cn(
                                  "shrink-0 w-11 h-6 rounded-full border transition-all cursor-pointer relative",
                                  isOn ? cn(c.bg, c.border) : "bg-white/5 border-white/10"
                                )}
                              >
                                <div
                                  className={cn(
                                    "absolute top-0.5 w-5 h-5 rounded-full transition-all duration-200 shadow-sm",
                                    isOn ? cn(c.dot, "left-5") : "bg-white/30 left-0.5"
                                  )}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Notification Summary Card */}
                      <div className="mt-2 p-3 bg-white/3 rounded-xl border border-white/8">
                        <p className="text-[9px] uppercase font-bold tracking-wider text-text-dim mb-2">Active Notifications Summary</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(notifications).filter(([, on]) => on).map(([key]) => {
                            const labels: Record<string, string> = { scheduled: "Scheduled", reminder: "Reminder", started: "Started", momPending: "MOM Pending", completed: "Completed" };
                            return (
                              <span key={key} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                {labels[key]}
                              </span>
                            );
                          })}
                          {!Object.values(notifications).some(Boolean) && (
                            <span className="text-[10px] text-text-dim/50">No notifications enabled.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* ── ──────────────────────────────────────────────────────────────── */}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE WIZARD MODAL */}
      {showCreateWizard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#06070d] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40">
              <div>
                <h2 className="text-lg font-bold font-orbitron text-white">Create Minutes of Meeting (MOM)</h2>
                {autoSaveStatus && (
                  <span className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1 animate-pulse">
                    <Save className="w-3 h-3" /> {autoSaveStatus}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  if (tempMeetingId && window.confirm("You have a draft version saved. Closing now will keep it in the list as Draft. Close?")) {
                    setShowCreateWizard(false);
                    fetchMeetings();
                  } else if (!tempMeetingId) {
                    setShowCreateWizard(false);
                  }
                }}
                className="p-1.5 hover:bg-white/10 rounded-lg text-text-dim hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Scroll */}
            <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Wizard Step 1: Select Method */}
              {wizardStep === 1 && (
                <div className="space-y-6 py-8">
                  <h3 className="text-center text-sm text-text-dim">Select MOM initialization mode:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                    {/* Method 1: Upload */}
                    <div
                      onClick={() => {
                        setCreationMethod("upload");
                        setWizardStep(2);
                      }}
                      className="glass-panel p-8 rounded-2xl border border-white/5 hover:border-cyan-400/50 hover:bg-cyan-500/5 cursor-pointer text-center space-y-4 group transition-all"
                    >
                      <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto text-cyan-400 group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                        <UploadCloud className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white">Upload MOM Document</h4>
                        <p className="text-xs text-text-dim mt-1.5 leading-relaxed">
                          Upload existing reports as PDF, DOCX, or XLSX formats, with versions and audit tracking.
                        </p>
                      </div>
                    </div>

                    {/* Method 2: Template */}
                    <div
                      onClick={() => {
                        setCreationMethod("template");
                        setWizardStep(2);
                      }}
                      className="glass-panel p-8 rounded-2xl border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/5 cursor-pointer text-center space-y-4 group transition-all"
                    >
                      <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto text-purple-400 group-hover:scale-105 transition-transform shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white">Create Using Template</h4>
                        <p className="text-xs text-text-dim mt-1.5 leading-relaxed">
                          Generate MOM metadata via 16 distinct operational fields inside our unified templates.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Wizard Step 2: Form */}
              {wizardStep === 2 && creationMethod && (
                <div className="space-y-5 dark-form-container">
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => {
                        if (tempMeetingId) {
                          if (window.confirm("You have a draft version saved. Going back will keep it saved in the list as Draft.")) {
                            setWizardStep(1);
                            setCreationMethod(null);
                            setTempMeetingId(null);
                            fetchMeetings();
                          }
                        } else {
                          setWizardStep(1);
                          setCreationMethod(null);
                        }
                      }}
                      className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to Initialization Mode
                    </button>
                  </div>

                  {/* Primary Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-left">Meeting Title *</label>
                      <input
                        type="text"
                        placeholder="Project Ops Alignment Session"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-left">Meeting Date & Time *</label>
                      <input
                        type="datetime-local"
                        value={formData.meetingDate}
                        onChange={(e) => setFormData(prev => ({ ...prev, meetingDate: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-left">Conducted By</label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={formData.conductedBy}
                        onChange={(e) => setFormData(prev => ({ ...prev, conductedBy: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-left">Platform</label>
                      <select
                        value={formData.platform}
                        onChange={(e) => setFormData(prev => ({ ...prev, platform: e.target.value }))}
                      >
                        <option value="Zoom">Zoom</option>
                        <option value="Microsoft Teams">Microsoft Teams</option>
                        <option value="Google Meet">Google Meet</option>
                        <option value="WebEx">WebEx</option>
                        <option value="Offline">Offline</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <label className="text-left">Attendees</label>
                      <input
                        type="text"
                        placeholder="John Doe, Jane Smith (separated by comma)"
                        value={formData.attendees}
                        onChange={(e) => setFormData(prev => ({ ...prev, attendees: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <label className="text-left">Absentees</label>
                      <input
                        type="text"
                        placeholder="Richard Roe (separated by comma)"
                        value={formData.absentees}
                        onChange={(e) => setFormData(prev => ({ ...prev, absentees: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Method specific fields */}
                  {creationMethod === "upload" ? (
                    <div className="border border-white/10 rounded-2xl bg-black/40 p-6 space-y-4">
                      <h4 className="text-xs font-bold font-orbitron uppercase text-cyan-400">Document Upload</h4>
                      
                      <div className="border border-dashed border-white/20 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3 hover:border-cyan-500/50 transition-all bg-black/20 relative group">
                        <input
                          type="file"
                          accept=".pdf,.docx,.xlsx"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload(e.target.files[0]);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        {uploading ? (
                          <>
                            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                            <span className="text-xs text-text-dim">UPLOADING DOCUMENT ASSETS...</span>
                          </>
                        ) : formData.filePath ? (
                          <>
                            <CheckCircle2 className="w-8 h-8 text-green-400" />
                            <div>
                              <span className="text-xs font-bold text-white block">{formData.fileName}</span>
                              <span className="text-[10px] text-text-dim block mt-0.5">
                                Size: {(formData.fileSize / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <span className="text-[10px] text-cyan-400 hover:underline cursor-pointer block pt-2">
                              Change file
                            </span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-8 h-8 text-white/40 group-hover:text-cyan-400 transition-colors" />
                            <div>
                              <span className="text-xs font-semibold block">Drag & drop or browse document file</span>
                              <span className="text-[10px] text-text-dim block mt-1">
                                Accepts PDF, DOCX, XLSX up to 25 MB
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 border border-white/10 rounded-2xl bg-black/40 p-6">
                      <h4 className="text-xs font-bold font-orbitron uppercase text-purple-400">MOM Template Data</h4>
                      
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-left font-bold text-[10px]">One-Line Summary</label>
                          <input
                            type="text"
                            placeholder="Aligned on sprint deliverables and service desk SLA policies"
                            value={formData.oneLineSummary}
                            onChange={(e) => setFormData(prev => ({ ...prev, oneLineSummary: e.target.value }))}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-left font-bold text-[10px]">Short Description (9 lines max)</label>
                          <textarea
                            rows={9}
                            style={{ resize: "none" }}
                            placeholder="Enter short description here (up to 9 lines)..."
                            value={formData.shortDescription}
                            onChange={(e) => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
                          />
                          <div className="flex justify-between mt-1 text-[10px]">
                            <span className={countLines(formData.shortDescription) > 9 ? "text-red-400 font-bold" : "text-white/40"}>
                              {countLines(formData.shortDescription)} / 9 lines max
                            </span>
                            {countLines(formData.shortDescription) > 9 && (
                              <span className="text-red-400 font-bold">Line limit exceeded!</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-left font-bold text-[10px]">Detailed Description (20 lines max)</label>
                          <textarea
                            rows={20}
                            style={{ resize: "none" }}
                            placeholder="Enter detailed description here (up to 20 lines)..."
                            value={formData.detailedDescription}
                            onChange={(e) => setFormData(prev => ({ ...prev, detailedDescription: e.target.value }))}
                          />
                          <div className="flex justify-between mt-1 text-[10px]">
                            <span className={countLines(formData.detailedDescription) > 20 ? "text-red-400 font-bold" : "text-white/40"}>
                              {countLines(formData.detailedDescription)} / 20 lines max
                            </span>
                            {countLines(formData.detailedDescription) > 20 && (
                              <span className="text-red-400 font-bold">Line limit exceeded!</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-left">Discussion Points</label>
                          <textarea
                            placeholder="- Discussed team capacity&#10;- Reviewed high priority SLA breaches..."
                            value={formData.discussionPoints}
                            onChange={(e) => setFormData(prev => ({ ...prev, discussionPoints: e.target.value }))}
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-left">Decisions Taken</label>
                          <textarea
                            placeholder="- Agreed to recruit another agent&#10;- SLA warnings configured..."
                            value={formData.decisionsTaken}
                            onChange={(e) => setFormData(prev => ({ ...prev, decisionsTaken: e.target.value }))}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1 md:col-span-2">
                            <label className="text-left">Action Items</label>
                            <textarea
                              rows={3}
                              placeholder="- Set up IMAP email syncing integration"
                              value={formData.actionItems}
                              onChange={(e) => setFormData(prev => ({ ...prev, actionItems: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-left">Responsible Person</label>
                              <input
                                type="text"
                                placeholder="Jane Smith"
                                value={formData.responsiblePerson}
                                onChange={(e) => setFormData(prev => ({ ...prev, responsiblePerson: e.target.value }))}
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-left">Target Date</label>
                              <input
                                type="text"
                                placeholder="By June 15, 2026"
                                value={formData.targetDate}
                                onChange={(e) => setFormData(prev => ({ ...prev, targetDate: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-left">Next Steps / Execution Plan</label>
                            <textarea
                              rows={3}
                              placeholder="Review implementation on the next align session"
                              value={formData.nextSteps}
                              onChange={(e) => setFormData(prev => ({ ...prev, nextSteps: e.target.value }))}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-left">Remarks</label>
                            <textarea
                              rows={3}
                              placeholder="Session recorded in corporate drive"
                              value={formData.remarks}
                              onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {wizardStep === 2 && (
              <div className="p-5 border-t border-white/10 bg-black/40 flex items-center justify-between shrink-0 flex-wrap gap-2">
                <span className="text-[10px] text-text-dim">
                  * Fields are required to save/submit drafts.
                </span>
                
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleSaveMeeting("Draft")}
                    disabled={isSubmitting || uploading}
                    className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-4 font-bold cursor-pointer text-xs"
                  >
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleSaveMeeting("Submitted")}
                    disabled={isSubmitting || uploading || (creationMethod === "template" && (countLines(formData.shortDescription) > 9 || countLines(formData.detailedDescription) > 20))}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 font-bold border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.15)] cursor-pointer text-xs"
                  >
                    {isSubmitting ? "Saving..." : "Submit MOM"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#06070d] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40">
              <div>
                <h2 className="text-lg font-bold font-orbitron text-white">Edit Minutes of Meeting (MOM)</h2>
                {autoSaveStatus && (
                  <span className="text-[10px] text-cyan-400 font-semibold flex items-center gap-1 animate-pulse">
                    <Save className="w-3 h-3" /> {autoSaveStatus}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-text-dim hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Scroll */}
            <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="space-y-5 dark-form-container">
                {/* Primary Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-left">Meeting Title *</label>
                    <input
                      type="text"
                      placeholder="Project Ops Alignment Session"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-left">Meeting Date & Time *</label>
                    <input
                      type="datetime-local"
                      value={formData.meetingDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, meetingDate: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-left">Conducted By</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={formData.conductedBy}
                      onChange={(e) => setFormData(prev => ({ ...prev, conductedBy: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-left">Platform</label>
                    <select
                      value={formData.platform}
                      onChange={(e) => setFormData(prev => ({ ...prev, platform: e.target.value }))}
                    >
                      <option value="Zoom">Zoom</option>
                      <option value="Microsoft Teams">Microsoft Teams</option>
                      <option value="Google Meet">Google Meet</option>
                      <option value="WebEx">WebEx</option>
                      <option value="Offline">Offline</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-left">Attendees</label>
                    <input
                      type="text"
                      placeholder="John Doe, Jane Smith (separated by comma)"
                      value={formData.attendees}
                      onChange={(e) => setFormData(prev => ({ ...prev, attendees: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-left">Absentees</label>
                    <input
                      type="text"
                      placeholder="Richard Roe (separated by comma)"
                      value={formData.absentees}
                      onChange={(e) => setFormData(prev => ({ ...prev, absentees: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Method specific fields */}
                {creationMethod === "upload" ? (
                  <div className="border border-white/10 rounded-2xl bg-black/40 p-6 space-y-4">
                    <h4 className="text-xs font-bold font-orbitron uppercase text-cyan-400">Document Upload</h4>
                    
                    <div className="border border-dashed border-white/20 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3 hover:border-cyan-500/50 transition-all bg-black/20 relative group">
                      <input
                        type="file"
                        accept=".pdf,.docx,.xlsx"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(e.target.files[0]);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {uploading ? (
                        <>
                          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                          <span className="text-xs text-text-dim">UPLOADING DOCUMENT ASSETS...</span>
                        </>
                      ) : formData.filePath ? (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-green-400" />
                          <div>
                            <span className="text-xs font-bold text-white block">{formData.fileName}</span>
                            <span className="text-[10px] text-text-dim block mt-0.5">
                              Size: {(formData.fileSize / 1024).toFixed(1)} KB
                            </span>
                          </div>
                          <span className="text-[10px] text-cyan-400 hover:underline cursor-pointer block pt-2">
                            Change file
                          </span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-8 h-8 text-white/40 group-hover:text-cyan-400 transition-colors" />
                          <div>
                            <span className="text-xs font-semibold block">Drag & drop or browse document file</span>
                            <span className="text-[10px] text-text-dim block mt-1">
                              Accepts PDF, DOCX, XLSX up to 25 MB
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 border border-white/10 rounded-2xl bg-black/40 p-6">
                    <h4 className="text-xs font-bold font-orbitron uppercase text-purple-400">MOM Template Data</h4>
                    
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-left font-bold text-[10px]">One-Line Summary</label>
                        <input
                          type="text"
                          placeholder="Aligned on sprint deliverables and service desk SLA policies"
                          value={formData.oneLineSummary}
                          onChange={(e) => setFormData(prev => ({ ...prev, oneLineSummary: e.target.value }))}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-left font-bold text-[10px]">Short Description (9 lines max)</label>
                        <textarea
                          rows={9}
                          style={{ resize: "none" }}
                          placeholder="Enter short description here (up to 9 lines)..."
                          value={formData.shortDescription}
                          onChange={(e) => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
                        />
                        <div className="flex justify-between mt-1 text-[10px]">
                          <span className={countLines(formData.shortDescription) > 9 ? "text-red-400 font-bold" : "text-white/40"}>
                            {countLines(formData.shortDescription)} / 9 lines max
                          </span>
                          {countLines(formData.shortDescription) > 9 && (
                            <span className="text-red-400 font-bold">Line limit exceeded!</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-left font-bold text-[10px]">Detailed Description (20 lines max)</label>
                        <textarea
                          rows={20}
                          style={{ resize: "none" }}
                          placeholder="Enter detailed description here (up to 20 lines)..."
                          value={formData.detailedDescription}
                          onChange={(e) => setFormData(prev => ({ ...prev, detailedDescription: e.target.value }))}
                        />
                        <div className="flex justify-between mt-1 text-[10px]">
                          <span className={countLines(formData.detailedDescription) > 20 ? "text-red-400 font-bold" : "text-white/40"}>
                            {countLines(formData.detailedDescription)} / 20 lines max
                          </span>
                          {countLines(formData.detailedDescription) > 20 && (
                            <span className="text-red-400 font-bold">Line limit exceeded!</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-left">Discussion Points</label>
                        <textarea
                          placeholder="- Discussed team capacity&#10;- Reviewed high priority SLA breaches..."
                          value={formData.discussionPoints}
                          onChange={(e) => setFormData(prev => ({ ...prev, discussionPoints: e.target.value }))}
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-left">Decisions Taken</label>
                        <textarea
                          placeholder="- Agreed to recruit another agent&#10;- SLA warnings configured..."
                          value={formData.decisionsTaken}
                          onChange={(e) => setFormData(prev => ({ ...prev, decisionsTaken: e.target.value }))}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1 md:col-span-2">
                          <label className="text-left">Action Items</label>
                          <textarea
                            rows={3}
                            placeholder="- Set up IMAP email syncing integration"
                            value={formData.actionItems}
                            onChange={(e) => setFormData(prev => ({ ...prev, actionItems: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-left">Responsible Person</label>
                            <input
                              type="text"
                              placeholder="Jane Smith"
                              value={formData.responsiblePerson}
                              onChange={(e) => setFormData(prev => ({ ...prev, responsiblePerson: e.target.value }))}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-left">Target Date</label>
                            <input
                              type="text"
                              placeholder="By June 15, 2026"
                              value={formData.targetDate}
                              onChange={(e) => setFormData(prev => ({ ...prev, targetDate: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-left">Next Steps / Execution Plan</label>
                          <textarea
                            rows={3}
                            placeholder="Review implementation on the next align session"
                            value={formData.nextSteps}
                            onChange={(e) => setFormData(prev => ({ ...prev, nextSteps: e.target.value }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-left">Remarks</label>
                          <textarea
                            rows={3}
                            placeholder="Session recorded in corporate drive"
                            value={formData.remarks}
                            onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-white/10 bg-black/40 flex items-center justify-between shrink-0 flex-wrap gap-2">
              <span className="text-[10px] text-text-dim">
                * Fields are required to save/submit updates.
              </span>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => handleSaveMeeting("Draft")}
                  disabled={isSubmitting || uploading}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-4 font-bold cursor-pointer text-xs"
                >
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  onClick={() => handleSaveMeeting("Submitted")}
                  disabled={isSubmitting || uploading || (creationMethod === "template" && (countLines(formData.shortDescription) > 9 || countLines(formData.detailedDescription) > 20))}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 font-bold border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.15)] cursor-pointer text-xs"
                >
                  {isSubmitting ? "Saving..." : "Submit Updates"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
