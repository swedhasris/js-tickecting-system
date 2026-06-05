import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { ActivityWatcher, type ActivitySnapshot, type WatcherStatus } from '../lib/activityCapture';

interface ActivityEntry {
  id: string;
  timestamp: string;
  appName: string; appIcon: string; appCategory: string; appColor: string;
  pageType: string; pageUrl: string; ticketNumber: string | null;
  activity: string; description: string; confidence: number;
  detectedApp: string | null;
  detectedWebsite: string | null;
  clicks: string[]; keystrokes: number; idleSeconds: number; scrollDepth: number;
  screenshotDataUrl: string | null; screenshotUrl: string | null;
  screenshotFilename: string | null;
  isProcessing: boolean; isIdle: boolean;
}

interface ActivityTrackerContextType {
  status: WatcherStatus;
  entries: ActivityEntry[];
  elapsed: number;
  summary: string | null;
  error: string | null;
  startWatcher: () => Promise<void>;
  stopWatcher: () => Promise<void>;
  setEntries: React.Dispatch<React.SetStateAction<ActivityEntry[]>>;
  setSummary: (s: string | null) => void;
  setError: (e: string | null) => void;
  intervalSec: number;
  setIntervalSec: (s: number) => void;
  captureScreenshots: boolean;
  setCaptureScreenshots: (c: boolean) => void;
  screenshotInterval: number;
  setScreenshotInterval: (s: number) => void;
  selectedIncident: string | null;
  setSelectedIncident: (incident: string | null) => void;
}

const ActivityTrackerContext = createContext<ActivityTrackerContextType | undefined>(undefined);

function getWeekMonday(d: string) {
  const dt = new Date((d || "").includes("T") ? d : (d + "T12:00:00"));
  if (isNaN(dt.getTime())) return new Date().toISOString().split("T")[0];
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day + (day === 0 ? -6 : 1));
  return dt.toISOString().split("T")[0];
}
function getWeekSunday(d: string) {
  const mondayStr = getWeekMonday(d);
  const m = new Date(mondayStr + "T12:00:00");
  if (isNaN(m.getTime())) return new Date().toISOString().split("T")[0];
  m.setDate(m.getDate() + 6);
  return m.toISOString().split("T")[0];
}

export function ActivityTrackerProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<WatcherStatus>('idle');
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intervalSec, setIntervalSec] = useState(15);
  const [captureScreenshots, setCaptureScreenshots] = useState(true);
  const [sessionDbId, setSessionDbId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const selectedIncidentRef = useRef<string | null>(null);
  useEffect(() => { selectedIncidentRef.current = selectedIncident; }, [selectedIncident]);

  const [screenshotInterval, setScreenshotIntervalState] = useState(() => {
    const saved = localStorage.getItem('screenshotCaptureInterval');
    return saved ? parseInt(saved, 10) : 30;
  });
  const setScreenshotInterval = (s: number) => {
    setScreenshotIntervalState(s);
    localStorage.setItem('screenshotCaptureInterval', s.toString());
  };

  useEffect(() => {
    localStorage.setItem('screenshotCaptureInterval', screenshotInterval.toString());
  }, [screenshotInterval]);

  const watcherRef = useRef<ActivityWatcher | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const prevActivityRef = useRef('');
  
  const sessionIdRef = useRef<string | null>(null);
  const sessionDbIdRef = useRef<string | null>(null);
  const intervalSecRef = useRef(15);
  const screenshotIntervalRef = useRef(screenshotInterval);
  const userRef = useRef(user);
  const profileRef = useRef(profile);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { intervalSecRef.current = intervalSec; }, [intervalSec]);
  useEffect(() => { screenshotIntervalRef.current = screenshotInterval; }, [screenshotInterval]);

  const isActive = status === 'active';

  /* ── Timer ── */
  useEffect(() => {
    if (isActive) {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now() - (elapsedRef.current * 1000);
      }
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const now = Date.now();
          const totalSec = Math.floor((now - startTimeRef.current) / 1000);
          setElapsed(totalSec);
          elapsedRef.current = totalSec;
        }
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      startTimeRef.current = null;
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [isActive]);

  const uploadScreenshot = useCallback(async (blob: Blob, filename: string): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append('screenshot', blob, filename);
      fd.append('userId', (userRef.current?.uid || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32));
      fd.append('format', 'jpeg');
      const res = await fetch('/api/upload-screenshot', { method: 'POST', body: fd });
      if (res.ok) { const d = await res.json(); return d.image_url; }
    } catch { /* silent */ }
    return null;
  }, []);

  const processSnapshot = useCallback(async (snap: ActivitySnapshot) => {
    const entryId = `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const userId = userRef.current?.uid || 'anonymous';
    const currentSessionId = sessionIdRef.current;

    if (snap.idleSeconds > 600) {
      setEntries(prev => {
        const lastEntry = prev[prev.length - 1];
        if (lastEntry?.isIdle) {
          return prev.map((e, i) =>
            i === prev.length - 1
              ? { ...e, timestamp: snap.timestamp, description: `User has been idle for ${Math.floor(snap.idleSeconds / 60)} minutes.`, idleSeconds: snap.idleSeconds }
              : e
          );
        }
        const idleEntry: ActivityEntry = {
          id: entryId, timestamp: snap.timestamp,
          appName: snap.appName, appIcon: snap.appIcon, appCategory: snap.appCategory, appColor: snap.appColor,
          pageType: snap.pageType, pageUrl: snap.url, ticketNumber: snap.ticketNumber,
          activity: 'Idle', description: `User has been idle for ${Math.floor(snap.idleSeconds / 60)} minutes.`,
          confidence: 0.95, clicks: [], keystrokes: 0, idleSeconds: snap.idleSeconds, scrollDepth: 0,
          screenshotDataUrl: null, screenshotUrl: null, screenshotFilename: null, isProcessing: false, isIdle: true,
          detectedApp: null, detectedWebsite: null
        };
        return [...prev, idleEntry];
      });
      return;
    }

    let activity = 'General Work';
    let description = `Working on ${snap.appName} — ${snap.pageType}`;
    let confidence = 0.8;

    const newEntry: ActivityEntry = {
      id: entryId, timestamp: snap.timestamp,
      appName: snap.appName, appIcon: snap.appIcon, appCategory: snap.appCategory, appColor: snap.appColor,
      pageType: snap.pageType, pageUrl: snap.url, ticketNumber: snap.ticketNumber,
      activity, description, confidence,
      clicks: snap.recentClicks, keystrokes: snap.recentKeys, idleSeconds: snap.idleSeconds, scrollDepth: snap.scrollDepth,
      screenshotDataUrl: snap.screenshotDataUrl, screenshotUrl: null, screenshotFilename: snap.screenshotFilename,
      isProcessing: true, isIdle: false,
      detectedApp: null, detectedWebsite: null
    };

    setEntries(prev => [...prev, newEntry]);

    let screenshotUrl: string | null = null;
    if (snap.screenshotBlob && snap.screenshotFilename) {
      screenshotUrl = await uploadScreenshot(snap.screenshotBlob, snap.screenshotFilename);
    }

    try {
      const aiTimeout = setTimeout(() => {}, 15000);
      const res = await fetch('/api/ai/analyze-activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          appName: snap.appName,
          appCategory: snap.appCategory,
          pageUrl: snap.url,
          pageTitle: snap.pageTitle,
          pageType: snap.pageType,
          ticketNumber: snap.ticketNumber,
          headings: snap.headings,
          formData: snap.formData,
          recentClicks: snap.recentClicks,
          recentKeys: snap.recentKeys,
          idleSeconds: snap.idleSeconds,
          scrollDepth: snap.scrollDepth,
          badges: snap.badges,
          visibleText: snap.visibleText.slice(0, 300),
          screenshot_url: screenshotUrl,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        activity = d.activity || activity;
        description = d.description || description;
        confidence = d.confidence ?? confidence;
        prevActivityRef.current = activity;
        setEntries(prev => prev.map(e =>
          e.id === entryId
            ? { ...e, activity, description, confidence, screenshotUrl, isProcessing: false, detectedApp: d.detected_app || null, detectedWebsite: d.detected_website || null }
            : e
        ));
        
        // Auto-update timesheet
        (async () => {
          try {
            const today = new Date().toISOString().split('T')[0];
            const mins = snap.deltaSec / 60;
            const taskMap: Record<string, string> = {
              'Ticket Work': 'Ticket Resolution', 'Timesheet Entry': 'Documentation',
              'Documentation': 'Documentation', 'Dashboard Review': 'General Support',
              'Reports Analysis': 'Documentation', 'Settings Configuration': 'System Maintenance',
              'Knowledge Base': 'Documentation', 'Calendar Review': 'Meeting',
              'Idle': 'General Support', 'General Work': 'General Support',
            };
            const task = taskMap[activity] || 'General Support';
            const shortDesc = `[AI Tracked] ${snap.appName} — ${snap.pageType}`;

            const tsRes = await fetch('/api/timesheets/get-or-create', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, week_start: getWeekMonday(today), week_end: getWeekSunday(today) }),
            });
            if (tsRes.ok) {
              const ts = await tsRes.json();
              const cardsRes = await fetch(`/api/time-cards?timesheet_id=${ts.id}`);
              if (cardsRes.ok) {
                const cards = await cardsRes.json();
                const existing = Array.isArray(cards) && cards.find(
                  (c: any) => c.entry_date === today && c.task === task && (c.short_description || '').startsWith('[AI Tracked]')
                );
                if (existing) {
                  await fetch(`/api/time-cards/${existing.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hours_worked: (parseFloat(existing.hours_worked) || 0) + mins, description, short_description: shortDesc }),
                  });
                } else {
                  await fetch('/api/time-cards', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ timesheet_id: ts.id, user_id: userId, entry_date: today, task, hours_worked: mins, description, short_description: shortDesc, work_type: 'Remote', billable: 'Billable', status: 'Draft' }),
                  });
                }
              }
            }
          } catch { /* silent */ }
        })();

        // Persist activity entry
        fetch('/api/activity-entries', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            session_id: currentSessionId, 
            user_id: userId, 
            activity_label: activity, 
            description, 
            confidence, 
            captured_at: snap.timestamp, 
            screenshot_url: screenshotUrl,
            keystrokes: snap.recentKeys,
            clicks: snap.recentClicks.length,
            ticket_number: selectedIncidentRef.current || null
          }),
        }).catch(() => { });

        return;
      }
    } catch { /* fallback */ }

    setEntries(prev => prev.map(e =>
      e.id === entryId
        ? { ...e, activity, description, confidence, screenshotUrl, isProcessing: false }
        : e
    ));
  }, [uploadScreenshot]);

  const startWatcher = useCallback(async () => {
    if (isActive) return;
    setError(null); setSummary(null); setEntries([]);
    setElapsed(0); elapsedRef.current = 0; startTimeRef.current = Date.now();
    prevActivityRef.current = '';

    const userId = userRef.current?.uid || 'anonymous';
    const userName = profileRef.current?.name || userRef.current?.email || 'User';
    const sid = `act_${Date.now()}`;
    setSessionId(sid);
    sessionIdRef.current = sid;

    try {
      const res = await fetch('/api/activity-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid, user_id: userId, user_name: userName, start_time: new Date().toISOString(), status: 'active', ticket_number: selectedIncidentRef.current || null }),
      });
      if (res.ok) { const d = await res.json(); setSessionDbId(String(d.id)); sessionDbIdRef.current = String(d.id); }
    } catch { /* silent */ }

    const watcher = new ActivityWatcher({
      intervalMs: screenshotInterval * 1000,
      captureScreenshots,
      onSnapshot: processSnapshot,
      onStatusChange: setStatus,
    });
    watcherRef.current = watcher;
    await watcher.start();
  }, [isActive, screenshotInterval, captureScreenshots, processSnapshot]);

  const stopWatcher = useCallback(async () => {
    if (!isActive) return;
    watcherRef.current?.stop();
    watcherRef.current = null;

    const finalDuration = elapsedRef.current;
    const userId = userRef.current?.uid || 'anonymous';
    const currentSessionDbId = sessionDbIdRef.current;

    const done = entries.filter(e => !e.isProcessing && !e.isIdle);
    if (done.length > 0) {
      try {
        const res = await fetch('/api/ai/generate-summary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_data: done.map(e => ({ timestamp: e.timestamp, activity: e.activity, description: e.description })), duration_seconds: finalDuration, userId }),
        });
        if (res.ok) { const d = await res.json(); setSummary(d.summary || 'Session completed.'); }
      } catch { setSummary('Session completed.'); }
    }

    if (currentSessionDbId) {
      try {
        await fetch(`/api/activity-sessions/${currentSessionDbId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stop_time: new Date().toISOString(), duration: finalDuration, status: 'completed' }),
        });
      } catch { /* silent */ }
    }
  }, [isActive, entries]);

  useEffect(() => () => { watcherRef.current?.stop(); }, []);
  useEffect(() => { watcherRef.current?.updateInterval(screenshotInterval * 1000); }, [screenshotInterval]);

  // Note: startWatcher already guards against double-starts (returns early if isActive).

  return (
    <ActivityTrackerContext.Provider value={{
      status, entries, elapsed, summary, error,
      startWatcher, stopWatcher, setEntries, setSummary, setError,
      intervalSec, setIntervalSec, captureScreenshots, setCaptureScreenshots,
      screenshotInterval, setScreenshotInterval,
      selectedIncident, setSelectedIncident
    }}>
      {children}
    </ActivityTrackerContext.Provider>
  );
}

export function useActivityTracker() {
  const context = useContext(ActivityTrackerContext);
  if (context === undefined) {
    throw new Error('useActivityTracker must be used within an ActivityTrackerProvider');
  }
  return context;
}
