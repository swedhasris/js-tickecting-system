import React, { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Clock, AlertCircle } from "lucide-react";

interface SLATimerProps {
  label: string;
  deadline: string;
  startTime?: string; // Total SLA duration reference
  metAt?: string;
  isPaused?: boolean;
  onHoldStart?: string;
  totalPausedTime?: number;
  waitUntil?: string | null;
}

/**
 * Safely parse any date value (ISO string, Firestore timestamp object, or Date)
 * into milliseconds. Returns NaN if unparseable.
 */
function toMs(val: any): number {
  if (!val) return NaN;
  // Firestore Timestamp object: { seconds: number, nanoseconds: number }
  if (typeof val === 'object' && val.seconds !== undefined) {
    return val.seconds * 1000 + (val.nanoseconds || 0) / 1_000_000;
  }
  // Firestore Timestamp with toDate()
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    return val.toDate().getTime();
  }
  // Already a number (ms)
  if (typeof val === 'number') return val;
  // ISO string or any string Date can parse
  const ms = new Date(val).getTime();
  return ms;
}

export function SLATimer({
  label,
  deadline,
  startTime,
  metAt,
  isPaused = false,
  onHoldStart,
  totalPausedTime = 0,
  waitUntil,
}: SLATimerProps) {
  const [displayTime, setDisplayTime] = useState("");
  const [breachDuration, setBreachDuration] = useState("");
  const [status, setStatus] = useState<"waiting" | "met" | "breached" | "active" | "paused">("active");
  const [percentage, setPercentage] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // SLA already met — freeze the display
    if (metAt) {
      const metMs = toMs(metAt);
      if (!isNaN(metMs)) {
        setStatus("met");
        setDisplayTime("MET ✓");
        setBreachDuration("");
        setPercentage(100);
        return;
      }
    }

    // Resolution SLA: waiting for first response before starting
    if (waitUntil !== undefined && (waitUntil === null || waitUntil === "")) {
      setStatus("waiting");
      setDisplayTime("PENDING");
      setBreachDuration("");
      return;
    }

    const deadlineMs = toMs(deadline);
    const startMs = startTime ? toMs(startTime) : (deadlineMs - 24 * 3_600_000); // Default to 24h if no start time
    
    if (isNaN(deadlineMs)) {
      setDisplayTime("--:--:--");
      return;
    }

    const tick = () => {
      const now = Date.now();
      let effectiveNow = now;
      
      if (isPaused && onHoldStart) {
        const holdMs = toMs(onHoldStart);
        if (!isNaN(holdMs)) effectiveNow = holdMs;
      }

      // Adjust for paused time
      const diff = deadlineMs - effectiveNow + (totalPausedTime || 0);
      const totalDuration = deadlineMs - (isNaN(startMs) ? deadlineMs - 24 * 3_600_000 : startMs);
      
      // Calculate percentage used: (elapsed / total) * 100
      const elapsed = effectiveNow - (isNaN(startMs) ? deadlineMs - 24 * 3_600_000 : startMs) - (totalPausedTime || 0);
      const calculatedPercentage = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

      if (diff <= 0) {
        // === BREACHED: Clamp display to 00:00:00 ===
        setStatus("breached");
        setDisplayTime("00:00:00");
        setPercentage(100);

        // Calculate how long ago the breach occurred (for context only)
        const overdue = Math.abs(diff);
        if (overdue >= 3_600_000) {
          const h = Math.floor(overdue / 3_600_000);
          const m = Math.floor((overdue % 3_600_000) / 60_000);
          setBreachDuration(`${h}h ${m}m overdue`);
        } else if (overdue >= 60_000) {
          const m = Math.floor(overdue / 60_000);
          setBreachDuration(`${m}m overdue`);
        } else {
          setBreachDuration("just breached");
        }

        // Stop the interval — no need to keep ticking once breached
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        setStatus(isPaused ? "paused" : "active");
        setBreachDuration("");
        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        const s = Math.floor((diff % 60_000) / 1_000);
        setDisplayTime(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        );
        setPercentage(calculatedPercentage);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [deadline, startTime, metAt, isPaused, onHoldStart, totalPausedTime, waitUntil]);

  // Advanced SLA Logic (Based on Percentage Used)
  const getEscalationStatus = () => {
    if (status === "met") return "COMPLETED";
    if (status === "breached") return "SLA BREACHED";
    if (status === "paused") return "PAUSED";
    if (percentage >= 90) return "CRITICAL NEAR BREACH";
    if (percentage >= 81) return "NEAR BREACH";
    if (percentage >= 51) return "WARNING";
    return "HEALTHY";
  };

  const getEscalationColor = () => {
    if (status === "met") return "bg-emerald-500";
    if (status === "breached") return "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]";
    if (status === "paused") return "bg-amber-400";
    if (percentage >= 90) return "bg-orange-600";
    if (percentage >= 81) return "bg-orange-500";
    if (percentage >= 51) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  const getEscalationTextColor = () => {
    if (status === "met") return "text-emerald-600";
    if (status === "breached") return "text-red-600 animate-pulse font-black";
    if (status === "paused") return "text-amber-600";
    if (status === "waiting") return "text-gray-400";
    
    if (percentage >= 90) return "text-orange-700 font-bold";
    if (percentage >= 81) return "text-orange-600";
    if (percentage >= 51) return "text-yellow-600";
    return "text-blue-600";
  };

  if (status === "waiting") {
    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-muted/30 rounded-md border border-border/50">
        <Clock className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest italic">Pending Handover</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-all group min-w-[160px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div className={cn("w-1.5 h-1.5 rounded-full", getEscalationColor())} />
          <span className="text-[8px] uppercase text-muted-foreground font-black tracking-widest">{label}</span>
        </div>
        <span className={cn(
          "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter transition-all",
          status === "met" ? "bg-emerald-50 text-emerald-700" :
            status === "breached" ? "bg-red-100 text-red-700 animate-bounce" :
              percentage >= 81 ? "bg-orange-100 text-orange-700" :
                percentage >= 51 ? "bg-yellow-100 text-yellow-700" : "bg-blue-50 text-blue-700"
        )}>
          {getEscalationStatus()}
        </span>
      </div>
      
      <div className="flex items-baseline justify-between gap-1.5">
        <span className={cn(
          "text-base font-mono font-black leading-none tracking-tight",
          getEscalationTextColor()
        )}>
          {displayTime}
        </span>
        <div className="flex flex-col items-end leading-none">
          <span className="text-[9px] font-black text-muted-foreground">{Math.round(percentage)}%</span>
          {status === "breached" && breachDuration && (
            <span className="text-[7px] font-bold text-red-500 italic uppercase">{breachDuration}</span>
          )}
        </div>
      </div>

      {/* Progress bar with Dynamic Colors */}
      <div className="relative w-full h-1.5 bg-muted rounded-full overflow-hidden shadow-inner">
        <motion.div
          layout
          className={cn("h-full transition-all duration-1000", getEscalationColor())}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
        />
      </div>

      {/* Escalation Notification Preview */}
      <div className="flex items-center justify-between mt-0.5 pt-0.5 border-t border-border/30">
        <span className="text-[7px] text-muted-foreground/80 font-bold uppercase tracking-tight">
          {percentage >= 100 ? "Escalated: Manager" : percentage >= 90 ? "Escalated: Lead" : percentage >= 80 ? "Escalated: Engineer" : "Status: Optimal"}
        </span>
        <AlertCircle className={cn("w-2.5 h-2.5", percentage >= 80 ? "text-orange-500" : "text-muted-foreground/20")} />
      </div>
    </div>
  );
}
