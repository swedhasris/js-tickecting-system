import React from "react";
import {
  Bell, Search, User, Sun, Moon, Monitor, Play, Square,
  FileText, ShieldAlert, GitBranch, BookOpen, Layers,
  Users as UsersIcon, CheckSquare, Clock, AlertCircle, Sparkles,
  SlidersHorizontal, X
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useActivityTracker } from "../contexts/ActivityTrackerContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-sn-green/30 text-sn-dark dark:text-sn-green font-semibold rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}

function fmtHMS(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

function formatTimeAgo(dateString: string) {
  if (!dateString) return 'some time ago';
  try {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 0) return 'just now';
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } catch (e) {
    return 'some time ago';
  }
}

export function AppNavbar() {
  const { user, profile } = useAuth();
  const { theme, setTheme, resolvedTheme, lightBrightness, setLightBrightness } = useTheme();
  const { status, elapsed, startWatcher, stopWatcher } = useActivityTracker();
  const [notificationCount, setNotificationCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState<any[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Global Search State
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<any>(null);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const [recentSearches, setRecentSearches] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sn-recent-searches") || "[]");
    } catch {
      return [];
    }
  });
  const [frequentRecords, setFrequentRecords] = React.useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("sn-frequent-records") || "[]");
    } catch {
      return [];
    }
  });

  const searchRef = React.useRef<HTMLDivElement>(null);

  // Advanced Search State
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [advFilters, setAdvFilters] = React.useState({
    searchIn: "all",
    category: "",
    caller: "",
    assignee: "",
    subject: "",
    watchList: "",
    priority: "",
    status: "",
    dateField: "created",
    startDate: "",
    startTime: "00:00",
    endDate: "",
    endTime: "23:59",
    hasAttachment: false
  });

  const handleAdvFilterChange = (key: string, value: any) => {
    setAdvFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearAdvFilters = () => {
    setAdvFilters({
      searchIn: "all",
      category: "",
      caller: "",
      assignee: "",
      subject: "",
      watchList: "",
      priority: "",
      status: "",
      dateField: "created",
      startDate: "",
      startTime: "00:00",
      endDate: "",
      endTime: "23:59",
      hasAttachment: false
    });
  };

  const handleAdvSearchSubmit = () => {
    setShowAdvanced(false);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.append("q", searchQuery.trim());
    params.append("searchIn", advFilters.searchIn);
    if (advFilters.category) params.append("category", advFilters.category);
    if (advFilters.caller) params.append("caller", advFilters.caller);
    if (advFilters.assignee) params.append("assignee", advFilters.assignee);
    if (advFilters.subject) params.append("subject", advFilters.subject);
    if (advFilters.watchList) params.append("watchList", advFilters.watchList);
    if (advFilters.priority) params.append("priority", advFilters.priority);
    if (advFilters.status) params.append("status", advFilters.status);
    params.append("dateField", advFilters.dateField);
    if (advFilters.startDate) {
      params.append("startDate", advFilters.startDate);
      params.append("startTime", advFilters.startTime);
    }
    if (advFilters.endDate) {
      params.append("endDate", advFilters.endDate);
      params.append("endTime", advFilters.endTime);
    }
    if (advFilters.hasAttachment) params.append("hasAttachment", "true");

    navigate(`/global-search?${params.toString()}`);
  };

  const isActive = status === 'active';

  React.useEffect(() => {
    const uid = user?.uid || profile?.uid;
    if (!uid) return;

    let disposed = false;

    // Load initial count and notifications list
    const loadData = async () => {
      try {
        // Count
        const countRes = await fetch(`/api/notifications/unread-count?user_id=${encodeURIComponent(uid)}`);
        if (countRes.ok) {
          const countData = await countRes.json();
          if (!disposed) setNotificationCount(Number(countData.count || 0));
        }

        // List
        const listRes = await fetch(`/api/notifications/list?user_id=${encodeURIComponent(uid)}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          if (!disposed) setNotifications(listData);
        }
      } catch (err) {
        console.error("Failed to load notifications:", err);
      }
    };

    loadData();

    // Establish SSE stream for real-time notifications
    const eventSource = new EventSource(`/api/notifications/stream?user_id=${encodeURIComponent(uid)}`);

    eventSource.onmessage = (event) => {
      try {
        const notif = JSON.parse(event.data);
        if (disposed) return;

        // Add to notifications list
        setNotifications(prev => [notif, ...prev.slice(0, 49)]);

        // Increment unread count
        setNotificationCount(prev => prev + 1);
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("SSE connection error, closing EventSource:", err);
      eventSource.close();
    };

    return () => {
      disposed = true;
      eventSource.close();
    };
  }, [user?.uid, profile?.uid]);

  // Debounced query fetching
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions(null);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch("/api/global-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            role: profile?.role || "user",
            userId: user?.uid || profile?.uid,
          })
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
        }
      } catch (err) {
        console.error("Suggestions fetch error:", err);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, profile?.role, user?.uid, profile?.uid]);

  // Click outside to close dropdown and search suggestions / advanced filter overlay
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setShowAdvanced(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false);
    } else if (e.key === "Enter") {
      setShowSuggestions(false);
      if (searchQuery.trim()) {
        const updated = [searchQuery.trim(), ...recentSearches.filter(s => s !== searchQuery.trim())].slice(0, 5);
        setRecentSearches(updated);
        localStorage.setItem("sn-recent-searches", JSON.stringify(updated));
        navigate(`/global-search?q=${encodeURIComponent(searchQuery.trim())}`);
      }
    }
  };

  const getPath = (item: any, type: string) => {
    switch (type) {
      case "incident":
      case "serviceRequest":
      case "ticket":
      case "task":
        return `/tickets/${item.id}`;
      case "problem":
        return `/problem`;
      case "change":
        return `/change`;
      case "kbArticle":
        return `/kb`;
      case "asset":
        return `/cmdb`;
      case "user":
        return `/users`;
      default:
        return "/";
    }
  };

  const handleItemClick = (item: any, type: string) => {
    setShowSuggestions(false);

    // Add query or title to recent searches
    const updated = [searchQuery.trim() || item.title || item.name || item.id, ...recentSearches.filter(s => s !== (searchQuery.trim() || item.title || item.name || item.id))].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("sn-recent-searches", JSON.stringify(updated));

    // Save to frequent records
    const newRecord = {
      id: item.id,
      title: item.title || item.name || item.ticket_number || item.id,
      type,
      path: getPath(item, type)
    };
    const updatedFreq = [newRecord, ...frequentRecords.filter(r => r.id !== item.id || r.type !== type)].slice(0, 5);
    setFrequentRecords(updatedFreq);
    localStorage.setItem("sn-frequent-records", JSON.stringify(updatedFreq));

    navigate(newRecord.path);
  };

  const handleRecentClick = (term: string) => {
    setSearchQuery(term);
    setShowSuggestions(true);
  };

  const removeRecent = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    const updated = recentSearches.filter(s => s !== term);
    setRecentSearches(updated);
    localStorage.setItem("sn-recent-searches", JSON.stringify(updated));
  };

  const hasSuggestions = suggestions && (
    suggestions.incidents?.length > 0 ||
    suggestions.serviceRequests?.length > 0 ||
    suggestions.problems?.length > 0 ||
    suggestions.changes?.length > 0 ||
    suggestions.kbArticles?.length > 0 ||
    suggestions.users?.length > 0 ||
    suggestions.assets?.length > 0 ||
    suggestions.tasks?.length > 0
  );

  const handleToggleOpen = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen) {
      const uid = user?.uid || profile?.uid;
      if (!uid) return;

      // Mark all as read
      try {
        await fetch("/api/notifications/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: uid })
        });

        setNotificationCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      } catch (err) {
        console.error("Failed to mark notifications as read:", err);
      }
    }
  };

  return (
    <header className="h-16 bg-white/45 dark:bg-[#080a14]/65 backdrop-blur-md border border-border/80 dark:border-white/10 flex items-center justify-between px-6 sticky top-4 z-10 m-4 mb-2 rounded-2xl shadow-xl shrink-0">
      <div className="relative w-96" ref={searchRef}>
        <div className="flex items-center gap-2 bg-muted/30 dark:bg-white/5 px-4 py-2 rounded-xl w-full border border-transparent focus-within:border-cyan-500/30 focus-within:ring-2 focus-within:ring-cyan-500/10 focus-within:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search tickets, users, articles, assets..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
              setShowAdvanced(false);
            }}
            onFocus={() => {
              setShowSuggestions(true);
              setShowAdvanced(false);
            }}
            onKeyDown={handleKeyDown}
            className="bg-transparent border-none outline-none text-xs w-full text-foreground placeholder:text-muted-foreground/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSuggestions(null);
              }}
              className="text-muted-foreground hover:text-foreground text-[10px] font-semibold px-1 shrink-0 cursor-pointer"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAdvanced(prev => !prev);
              setShowSuggestions(false);
            }}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center border transition-all shrink-0 ml-1 cursor-pointer",
              showAdvanced
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-lg shadow-cyan-500/20"
                : "border-muted-foreground/20 text-muted-foreground hover:border-cyan-500/50 hover:text-cyan-400"
            )}
            title="Advanced Search Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Advanced Search Filters Popup */}
        {showAdvanced && (
          <div className="absolute top-full left-0 mt-2 w-full max-w-[500px] bg-[#090a15]/95 backdrop-blur-xl border border-cyan-500/20 rounded-2xl shadow-2xl p-5 z-50 text-white animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-outfit font-black uppercase tracking-widest text-cyan-400">Advanced Query Filters</h3>
              <button
                type="button"
                onClick={() => setShowAdvanced(false)}
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[10px] font-outfit">
              {/* Row 1 */}
              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">Search In</label>
                <select
                  value={advFilters.searchIn}
                  onChange={e => handleAdvFilterChange("searchIn", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px]"
                >
                  <option value="all">All Tickets</option>
                  <option value="tickets">Tickets (All)</option>
                  <option value="incidents">Incidents</option>
                  <option value="serviceRequests">Service Requests</option>
                  <option value="problems">Problems</option>
                  <option value="changes">Changes</option>
                  <option value="kbArticles">Knowledge Articles</option>
                  <option value="assets">Assets (CMDB)</option>
                  <option value="users">Users</option>
                  <option value="tasks">My Tasks</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">Category</label>
                <select
                  value={advFilters.category}
                  onChange={e => handleAdvFilterChange("category", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px]"
                >
                  <option value="">All Categories</option>
                  <option value="Hardware">Hardware</option>
                  <option value="Network">Network</option>
                  <option value="Software">Software</option>
                  <option value="Database">Database</option>
                  <option value="Applications">Applications</option>
                  <option value="Security">Security</option>
                  <option value="Access">Access</option>
                  <option value="General">General</option>
                  <option value="Inquiry / Help">Inquiry / Help</option>
                </select>
              </div>

              {/* Row 2 */}
              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">From (Caller)</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={advFilters.caller}
                  onChange={e => handleAdvFilterChange("caller", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px] placeholder:text-white/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">To (Assigned To)</label>
                <input
                  type="text"
                  placeholder="e.g. Agent Smith"
                  value={advFilters.assignee}
                  onChange={e => handleAdvFilterChange("assignee", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px] placeholder:text-white/20"
                />
              </div>

              {/* Row 3 - Subject */}
              <div className="col-span-2 space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">Subject (Short Description)</label>
                <input
                  type="text"
                  placeholder="e.g. Printer issue"
                  value={advFilters.subject}
                  onChange={e => handleAdvFilterChange("subject", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px] placeholder:text-white/20"
                />
              </div>

              {/* Row 4 */}
              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">CC (Watch List)</label>
                <input
                  type="text"
                  placeholder="e.g. manager@org.com"
                  value={advFilters.watchList}
                  onChange={e => handleAdvFilterChange("watchList", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px] placeholder:text-white/20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">Priority</label>
                <select
                  value={advFilters.priority}
                  onChange={e => handleAdvFilterChange("priority", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px]"
                >
                  <option value="">All Priorities</option>
                  <option value="1 - Critical">1 - Critical</option>
                  <option value="2 - High">2 - High</option>
                  <option value="3 - Medium">3 - Medium</option>
                  <option value="4 - Low">4 - Low</option>
                </select>
              </div>

              {/* Row 5 */}
              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">State (Status)</label>
                <select
                  value={advFilters.status}
                  onChange={e => handleAdvFilterChange("status", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px]"
                >
                  <option value="">All States</option>
                  <option value="New">New</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">Date Range Field</label>
                <select
                  value={advFilters.dateField}
                  onChange={e => handleAdvFilterChange("dateField", e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none focus:border-cyan-500/50 text-[11px]"
                >
                  <option value="created">Created Date</option>
                  <option value="updated">Updated Date</option>
                </select>
              </div>

              {/* Row 6 - Start Date & Time */}
              <div className="col-span-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">Start Date & Time</label>
                  <input
                     type="date"
                     value={advFilters.startDate}
                     onChange={e => handleAdvFilterChange("startDate", e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none text-[11px]"
                  />
                </div>
                <div className="space-y-1 self-end">
                  <input
                     type="time"
                     value={advFilters.startTime}
                     onChange={e => handleAdvFilterChange("startTime", e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none text-[11px]"
                  />
                </div>
              </div>

              {/* Row 7 - End Date & Time */}
              <div className="col-span-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-white/50 font-bold uppercase tracking-wider text-[8px]">End Date & Time</label>
                  <input
                     type="date"
                     value={advFilters.endDate}
                     onChange={e => handleAdvFilterChange("endDate", e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none text-[11px]"
                  />
                </div>
                <div className="space-y-1 self-end">
                  <input
                     type="time"
                     value={advFilters.endTime}
                     onChange={e => handleAdvFilterChange("endTime", e.target.value)}
                     className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white outline-none text-[11px]"
                  />
                </div>
              </div>

              {/* Checkbox */}
              <div className="col-span-2 pt-1">
                <label className="flex items-center gap-2 text-[10px] text-white/70 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={advFilters.hasAttachment}
                    onChange={e => handleAdvFilterChange("hasAttachment", e.target.checked)}
                    className="rounded border-white/15 bg-black/40 text-cyan-400 focus:ring-cyan-400 w-3.5 h-3.5"
                  />
                  <span>HAS ATTACHMENT / AUDIT HISTORY</span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-4 text-xs font-outfit">
              <button
                type="button"
                onClick={clearAdvFilters}
                className="text-white/60 hover:text-white hover:underline transition-colors cursor-pointer"
              >
                Clear filters
              </button>
              <button
                type="button"
                onClick={handleAdvSearchSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 rounded-xl transition-all shadow-[0_0_12px_rgba(37,99,235,0.3)] cursor-pointer"
              >
                Execute Query
              </button>
            </div>
          </div>
        )}

        {/* Suggestion Dropdown Panel */}
        {showSuggestions && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-[#090a15]/95 backdrop-blur-xl border border-border dark:border-white/10 rounded-2xl shadow-2xl max-h-[28rem] overflow-y-auto z-50 custom-scrollbar animate-in fade-in slide-in-from-top-1 duration-150 text-sn-dark dark:text-white">

            {/* 1. Empty state (Recent & Frequent searches) */}
            {!searchQuery.trim() && (
              <div className="p-4 space-y-4 font-outfit">
                {recentSearches.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent Queries</h4>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term, idx) => (
                        <span
                          key={idx}
                          onClick={() => handleRecentClick(term)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-muted dark:bg-white/5 hover:bg-cyan-500/10 dark:hover:bg-cyan-500/10 hover:text-cyan-400 text-xs rounded-full cursor-pointer transition-colors"
                        >
                          {term}
                          <button
                            onClick={(e) => removeRecent(e, term)}
                            className="hover:text-red-500 font-bold ml-1 text-[9px]"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {frequentRecords.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Frequently Visited</h4>
                    <div className="space-y-1">
                      {frequentRecords.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => navigate(item.path)}
                          className="flex items-center justify-between p-2 hover:bg-muted/50 dark:hover:bg-white/5 rounded-xl text-xs cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold truncate">{item.title}</span>
                          </div>
                          <span className="text-[9px] uppercase tracking-wider bg-muted/60 dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground shrink-0 font-bold">
                            {item.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recentSearches.length === 0 && frequentRecords.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    Type a query or press <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] border">Enter</kbd> to search everything
                  </div>
                )}
              </div>
            )}

            {/* 2. Loading state */}
            {searchQuery.trim() && loadingSuggestions && (
              <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground font-outfit">
                <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                Scanning AI Knowledge Nodes...
              </div>
            )}

            {/* 3. Results matches */}
            {searchQuery.trim() && !loadingSuggestions && (
              <div className="font-outfit">
                {!hasSuggestions ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    No results found for "{searchQuery}".
                  </div>
                ) : (
                  <div>
                    {/* Tasks / Action Items */}
                    {suggestions.tasks?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>My Action Items / Tasks</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.tasks.length}
                          </span>
                        </div>
                        {suggestions.tasks.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "task")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <CheckSquare className="w-4 h-4 text-amber-500 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate flex items-center">
                                <span className="text-[10px] font-mono bg-muted dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground mr-2 shrink-0">{item.ticket_number || `TASK-${item.id}`}</span>
                                <span className="truncate"><Highlight text={item.title} query={searchQuery} /></span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.category} • Assigned to me</div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border bg-amber-550/10 text-amber-500 border-amber-500/20 shrink-0">
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Incidents */}
                    {suggestions.incidents?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Incidents</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.incidents.length}
                          </span>
                        </div>
                        {suggestions.incidents.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "incident")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate flex items-center">
                                <span className="text-[10px] font-mono bg-muted dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground mr-2 shrink-0">{item.ticket_number}</span>
                                <span className="truncate"><Highlight text={item.title} query={searchQuery} /></span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                Caller: {item.caller} • Priority: {item.priority}
                              </div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border border-border/50 bg-muted/30 dark:bg-white/5 text-muted-foreground shrink-0">
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Service Requests */}
                    {suggestions.serviceRequests?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Service Requests</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.serviceRequests.length}
                          </span>
                        </div>
                        {suggestions.serviceRequests.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "serviceRequest")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <Layers className="w-4 h-4 text-green-400 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate flex items-center">
                                <span className="text-[10px] font-mono bg-muted dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground mr-2 shrink-0">{item.ticket_number}</span>
                                <span className="truncate"><Highlight text={item.title} query={searchQuery} /></span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                Caller: {item.caller} • Priority: {item.priority}
                              </div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border border-border/50 bg-muted/30 dark:bg-white/5 text-muted-foreground shrink-0">
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Problems */}
                    {suggestions.problems?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Problems</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.problems.length}
                          </span>
                        </div>
                        {suggestions.problems.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "problem")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate flex items-center">
                                <span className="text-[10px] font-mono bg-muted dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground mr-2 shrink-0">{item.id || "PRB"}</span>
                                <span className="truncate"><Highlight text={item.title} query={searchQuery} /></span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border border-border/50 bg-muted/30 dark:bg-white/5 text-muted-foreground shrink-0">
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Changes */}
                    {suggestions.changes?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Changes</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.changes.length}
                          </span>
                        </div>
                        {suggestions.changes.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "change")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <GitBranch className="w-4 h-4 text-purple-400 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate flex items-center">
                                <span className="text-[10px] font-mono bg-muted dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground mr-2 shrink-0">{item.id || "CHG"}</span>
                                <span className="truncate"><Highlight text={item.title} query={searchQuery} /></span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg border border-border/50 bg-muted/30 dark:bg-white/5 text-muted-foreground shrink-0">
                              {item.state || item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* KB Articles */}
                    {suggestions.kbArticles?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Knowledge Base</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.kbArticles.length}
                          </span>
                        </div>
                        {suggestions.kbArticles.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "kbArticle")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <BookOpen className="w-4 h-4 text-orange-400 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate">
                                <Highlight text={item.title} query={searchQuery} />
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.category} • Author: {item.author}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Assets */}
                    {suggestions.assets?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Assets (CMDB)</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.assets.length}
                          </span>
                        </div>
                        {suggestions.assets.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "asset")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate flex items-center">
                                <span className="text-[10px] font-mono bg-muted dark:bg-white/10 px-1.5 py-0.5 rounded text-muted-foreground mr-2 shrink-0">{item.id}</span>
                                <span className="truncate"><Highlight text={item.name} query={searchQuery} /></span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.type} • Owner: {item.owner}</div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-100/20 shrink-0">
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Users */}
                    {suggestions.users?.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted/30 dark:bg-white/5 px-4 py-1.5 flex items-center justify-between border-y border-border dark:border-white/5">
                          <span>Users</span>
                          <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            {suggestions.users.length}
                          </span>
                        </div>
                        {suggestions.users.map((item: any) => (
                          <div
                            key={item.id}
                            onClick={() => handleItemClick(item, "user")}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer border-b border-border/50 dark:border-white/5 last:border-b-0"
                          >
                            <UsersIcon className="w-4 h-4 text-teal-400 shrink-0" />
                            <div className="flex-grow min-w-0">
                              <div className="text-xs font-semibold text-sn-dark dark:text-white truncate">
                                <Highlight text={item.name} query={searchQuery} />
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{item.email} • Role: {item.role}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div
                      onClick={() => {
                        setShowSuggestions(false);
                        const updated = [searchQuery.trim(), ...recentSearches.filter(s => s !== searchQuery.trim())].slice(0, 5);
                        setRecentSearches(updated);
                        localStorage.setItem("sn-recent-searches", JSON.stringify(updated));
                        navigate(`/global-search?q=${encodeURIComponent(searchQuery.trim())}`);
                      }}
                      className="p-3 text-center text-xs font-outfit font-black text-cyan-400 hover:bg-cyan-500/10 cursor-pointer border-t border-border dark:border-white/10 transition-colors"
                    >
                      View all results in Operations Center
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">

        {/* ── Global AI Activity Tracker Toggle ── */}
        {!isActive ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/40 px-3 py-1.5 transition-all duration-300 bg-muted/20 hover:bg-green-500/5 hover:border-green-500/30">
            <button
              id="global-ai-tracker-start"
              onClick={() => startWatcher()}
              title="Start AI Activity Tracker"
              className="flex items-center gap-1.5 text-xs font-outfit font-bold text-green-600 hover:text-green-500 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-green-500 text-green-500" />
              <span className="hidden md:inline">Resume Sentinel</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-3 py-1.5 transition-all duration-300 bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.2)]">
            <button
              id="global-ai-tracker-stop"
              onClick={() => stopWatcher()}
              title="Stop AI Activity Tracker"
              className="flex items-center gap-1.5 text-xs font-outfit font-bold text-red-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current text-current animate-pulse" />
              <span className="hidden md:inline">Sentinel Active</span>
            </button>
          </div>
        )}

        {/* Theme Toggle & Brightness Control Container */}
        <div className="flex items-center gap-1 bg-muted/20 dark:bg-white/5 rounded-xl p-1 border border-border/30">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setTheme("light")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${theme === "light" ? "bg-white dark:bg-white/15 shadow-sm text-cyan-400" : "text-muted-foreground hover:text-foreground"}`}
              title="Light mode"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${theme === "dark" ? "bg-white dark:bg-white/15 shadow-sm text-cyan-400" : "text-muted-foreground hover:text-foreground"}`}
              title="Dark mode"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setTheme("system")}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${theme === "system" ? "bg-white dark:bg-white/15 shadow-sm text-cyan-400" : "text-muted-foreground hover:text-foreground"}`}
              title="System preference"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Luxury Brightness slider exclusively in Light Mode */}
          {resolvedTheme === "light" && (
            <div className="flex items-center gap-2 border-l border-border/60 pl-2 pr-1.5 animate-in slide-in-from-right duration-200">
              <Sun className="w-3 h-3 text-muted-foreground" />
              <input
                type="range"
                min="80"
                max="99"
                value={lightBrightness}
                onChange={(e) => setLightBrightness(Number(e.target.value))}
                className="w-16 h-1 bg-muted-foreground/30 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none"
                title="Adjust background brightness"
              />
            </div>
          )}
        </div>

        {/* Notifications Bell with beautiful interactive dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={handleToggleOpen}
            className="relative text-muted-foreground hover:text-foreground transition-all duration-200 p-1.5 rounded-lg hover:bg-muted/30 cursor-pointer"
            title={notificationCount > 0 ? `${notificationCount} unread notifications` : "Notifications"}
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 bg-destructive text-white rounded-full text-[8px] font-bold flex items-center justify-center leading-none animate-bounce shadow-lg">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            ) : null}
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white/95 dark:bg-[#090a15]/95 backdrop-blur-xl border border-border dark:border-cyan-500/20 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-200 shadow-[0_15px_50px_rgba(0,0,0,0.4)]">
              {/* Header */}
              <div className="px-4 py-3 border-b border-border dark:border-white/10 bg-gradient-to-r from-[#030712] to-slate-900 text-white flex items-center justify-between font-outfit">
                <span className="font-bold text-xs uppercase tracking-wider">Operational Intel</span>
                {notifications.length > 0 && (
                  <span className="text-[9px] text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 rounded-full font-bold">
                    {notifications.filter(n => !n.is_read).length} Unread
                  </span>
                )}
              </div>

              {/* List */}
              <div className="max-h-96 overflow-y-auto divide-y divide-border/60 dark:divide-white/5 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-xs font-outfit">
                    No system reports recorded.
                  </div>
                ) : (
                  notifications.map(notif => {
                    const initials = (notif.actor_name || "S")[0].toUpperCase();
                    const timeAgo = formatTimeAgo(notif.created_at);
                    const isUnread = !notif.is_read;

                    return (
                      <div
                        key={notif.id}
                        className={`p-4 flex items-start gap-3 hover:bg-primary/5 transition-colors font-outfit ${isUnread ? 'bg-blue-500/5' : ''}`}
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 text-xs font-bold flex items-center justify-center flex-shrink-0 border border-blue-500/20 shadow-[0_0_10px_rgba(37,99,235,0.1)]">
                          {initials}
                        </div>

                        {/* Content */}
                        <div className="flex-grow min-w-0">
                          <p className="text-xs text-foreground font-medium leading-relaxed break-words">
                            {notif.message}
                          </p>

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {notif.ticket_number && (
                              <a
                                href={`/tickets/${notif.ticket_id}`}
                                className="text-[9px] font-mono font-bold bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/20 hover:bg-blue-500/20 transition-all hover:underline"
                              >
                                {notif.ticket_number}
                              </a>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {timeAgo}
                            </span>
                          </div>
                        </div>

                        {/* Unread indicator dot */}
                        {isUnread && (
                          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5 animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pl-6 border-l border-border/80 dark:border-white/10">
          <div className="text-right hidden md:block font-outfit">
            <div className="text-xs font-bold text-foreground">{profile?.name || "User"}</div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-black">{profile?.role || "Guest"}</div>
          </div>
          <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center shadow-lg shadow-black/10">
            <User className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          </div>
        </div>
      </div>
    </header>
  );
}
