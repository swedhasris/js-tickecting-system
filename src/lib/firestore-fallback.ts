import * as realFS from "@firebase/firestore";
import { parseSlaDelayLogs, parseSlaDelayMeta } from "./slaDelayUtils";

// Global flag to track if Firestore is exhausted
let firestoreExhausted = true;

export function isFirestoreExhausted() {
  return firestoreExhausted;
}

export function setFirestoreExhausted(val: boolean) {
  firestoreExhausted = val;
}

interface FallbackListener {
  queryOrDoc: any;
  onNext: (snapshot: any) => void;
  active: () => boolean;
  trigger: () => void;
}

const activeListeners: FallbackListener[] = [];

function notifyListeners(path: string, id?: string) {
  activeListeners.forEach(listener => {
    if (!listener.active()) return;
    const lDoc = listener.queryOrDoc;
    if (lDoc && lDoc.type === "document") {
      if (lDoc.path === path && (!id || lDoc.id === id)) {
        listener.trigger();
      }
    } else if (lDoc && (lDoc.type === "collection" || lDoc.type === "query")) {
      const collPath = lDoc.type === "query" ? lDoc.collectionRef.path : lDoc.path;
      if (collPath === path) {
        listener.trigger();
      }
    }
  });
}

// Fallback Objects for query building
export class FallbackCollectionReference {
  type = "collection" as const;
  constructor(public db: any, public path: string) {}
}

export class FallbackQuery {
  type = "query" as const;
  constructor(public collectionRef: FallbackCollectionReference, public clauses: any[] = []) {}
}

export class FallbackDocumentReference {
  type = "document" as const;
  constructor(public db: any, public path: string, public id: string) {}
}

// Map db ticket to frontend camelCase
function mapDbTicketToFrontend(t: any): any {
  if (!t) return null;
  return {
    id: String(t.id || t.ticket_number || ""),
    number: t.ticket_number || t.number || "",
    caller: t.caller || "",
    category: t.category || "",
    incidentCategory: t.incident_category || t.incidentCategory || "",
    subcategory: t.subcategory || "",
    service: t.service || "",
    serviceOffering: t.service_offering || t.serviceOffering || "",
    cmdbItem: t.cmdb_item || t.cmdbItem || "",
    title: t.title || "",
    description: t.description || "",
    status: t.status || "New",
    priority: t.priority || "4 - Low",
    impact: t.impact || "3 - Low",
    urgency: t.urgency || "3 - Low",
    channel: t.channel || "Self-service",
    assignmentGroup: t.assignment_group || t.assignmentGroup || "",
    assignedTo: t.assigned_to || t.assignedTo || "",
    assignedToName: t.assigned_to_name || t.assignedToName || "",
    createdBy: t.created_by || t.createdBy || "",
    createdByName: t.created_by_name || t.createdByName || "",
    resolvedBy: t.resolved_by || t.resolvedBy || "",
    resolvedByName: t.resolved_by_name || t.resolvedByName || "",
    resolvedAt: t.resolved_at || t.resolvedAt || null,
    closedBy: t.closed_by || t.closedBy || "",
    closedByName: t.closed_by_name || t.closedByName || "",
    closedAt: t.closed_at || t.closedAt || null,
    responseDeadline: t.response_deadline || t.responseDeadline || null,
    resolutionDeadline: t.resolution_deadline || t.resolutionDeadline || null,
    responseSlaStatus: t.response_sla_status || t.responseSlaStatus || "Pending",
    resolutionSlaStatus: t.resolution_sla_status || t.resolutionSlaStatus || "Pending",
    responseSlaStartTime: t.response_sla_start_time || t.responseSlaStartTime || null,
    resolutionSlaStartTime: t.resolution_sla_start_time || t.resolutionSlaStartTime || null,
    firstResponseAt: t.first_response_at || t.firstResponseAt || null,
    totalPausedTime: t.total_paused_time ?? t.totalPausedTime ?? 0,
    onHoldStart: t.on_hold_start || t.onHoldStart || null,
    points: t.points ?? 0,
    slaDelayMeta: parseSlaDelayMeta(t.sla_delay_meta_json || t.slaDelayMeta),
    slaDelayLogs: parseSlaDelayLogs(t.sla_delay_logs_json || t.slaDelayLogs),
    createdAt: t.created_at || t.createdAt || null,
    updatedAt: t.updated_at || t.updatedAt || null,
  };
}

async function fetchFallbackData(path: string, queryObj?: any): Promise<any[]> {
  console.log(`[Firestore Fallback] Fetching data for path: "${path}"`);
  
  try {
    if (path.startsWith("tickets")) {
      // Check if resolved query
      let isResolvedQuery = false;
      if (queryObj && queryObj.clauses) {
        const whereClause = queryObj.clauses.find((c: any) => c.type === "where" && c.field === "status");
        if (whereClause) {
          const val = whereClause.value;
          if (val === "Resolved" || val === "Closed" || (Array.isArray(val) && (val.includes("Resolved") || val.includes("Closed")))) {
            isResolvedQuery = true;
          }
        }
      }
      
      const url = isResolvedQuery ? "/api/tickets/resolved" : "/api/tickets/open";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const dbTickets = await res.json();
      return dbTickets.map(mapDbTicketToFrontend);
    }
    
    if (path === "users") {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const dbUsers = await res.json();
      return dbUsers.map((u: any) => ({
        id: u.uid || String(u.id),
        uid: u.uid || String(u.id),
        name: u.name || "",
        email: u.email || "",
        role: u.role || "user",
        phone: u.phone || ""
      }));
    }
    
    if (path === "sla_breaches") {
      let url = "/api/sla-breaches/all";
      if (queryObj && queryObj.clauses) {
        const whereClause = queryObj.clauses.find((c: any) => c.type === "where" && (c.field === "assigned_user" || c.field === "assignedTo"));
        if (whereClause && whereClause.value) {
          url = `/api/sla-breaches/user/${whereClause.value}`;
        }
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      return await res.json();
    }
    
    if (path === "sla_policies") {
      return [
        { id: "p1", name: "P1 SLA", priority: "1 - Critical", category: "", resolutionTimeMinutes: 240, isActive: true },
        { id: "p2", name: "P2 SLA", priority: "2 - High", category: "", resolutionTimeMinutes: 480, isActive: true },
        { id: "p3", name: "P3 SLA", priority: "3 - Moderate", category: "", resolutionTimeMinutes: 1440, isActive: true },
        { id: "p4", name: "P4 SLA", priority: "4 - Low", category: "", resolutionTimeMinutes: 4320, isActive: true }
      ];
    }
    
    if (path === "companies") {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return await res.json();
    }
    
    if (path.includes("/comments")) {
      const parts = path.split("/");
      const ticketId = parts[1];
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.comments || [];
    }
  } catch (err) {
    console.error(`[Firestore Fallback] Error fetching path "${path}":`, err);
  }
  
  return [];
}

// -------------------------------------------------------------
// Intercepted and fallback Firestore methods
// -------------------------------------------------------------

export function collection(...args: any[]): any {
  if (firestoreExhausted) {
    const path = typeof args[0] === "string" ? args[0] : args[1];
    return new FallbackCollectionReference(args[0], path);
  }
  try {
    return (realFS.collection as any)(...args);
  } catch (e) {
    const path = typeof args[0] === "string" ? args[0] : args[1];
    return new FallbackCollectionReference(null, path);
  }
}

export function doc(...args: any[]): any {
  if (firestoreExhausted) {
    let path = "";
    let id = "";
    if (args[0] && (args[0].type === "collection" || args[0] instanceof realFS.CollectionReference)) {
      path = args[0].path;
      id = args[1];
    } else {
      path = args[1];
      id = args[2];
    }
    return new FallbackDocumentReference(args[0], path, id);
  }
  try {
    return (realFS.doc as any)(...args);
  } catch (e) {
    let path = "";
    let id = "";
    if (args[0] && args[0].path) {
      path = args[0].path;
      id = args[1];
    } else {
      path = args[1];
      id = args[2];
    }
    return new FallbackDocumentReference(null, path, id);
  }
}

export function query(queryRef: any, ...clauses: any[]): any {
  if (firestoreExhausted || (queryRef && (queryRef.type === "query" || queryRef.type === "collection"))) {
    const collRef = queryRef.type === "query" ? queryRef.collectionRef : queryRef;
    const allClauses = queryRef.type === "query" ? [...queryRef.clauses, ...clauses] : clauses;
    return new FallbackQuery(collRef, allClauses);
  }
  try {
    return (realFS.query as any)(queryRef, ...clauses);
  } catch (e) {
    const collRef = queryRef.type === "query" ? queryRef.collectionRef : queryRef;
    return new FallbackQuery(collRef, clauses);
  }
}

export function where(field: string, op: string, value: any): any {
  if (firestoreExhausted) {
    return { type: "where", field, op, value };
  }
  try {
    return realFS.where(field, op as any, value);
  } catch (e) {
    return { type: "where", field, op, value };
  }
}

export function orderBy(field: string, direction?: any): any {
  if (firestoreExhausted) {
    return { type: "orderBy", field, direction };
  }
  try {
    return realFS.orderBy(field, direction);
  } catch (e) {
    return { type: "orderBy", field, direction };
  }
}

export function limit(n: number): any {
  if (firestoreExhausted) {
    return { type: "limit", limit: n };
  }
  try {
    return realFS.limit(n);
  } catch (e) {
    return { type: "limit", limit: n };
  }
}

export async function getDocs(queryObj: any): Promise<any> {
  if (firestoreExhausted || (queryObj && (queryObj.type === "query" || queryObj.type === "collection"))) {
    const path = queryObj.type === "query" ? queryObj.collectionRef.path : queryObj.path;
    const dataList = await fetchFallbackData(path, queryObj);
    
    const docs = dataList.map(item => ({
      id: String(item.id),
      data: () => item,
      exists: () => true
    }));
    
    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (callback: any) => {
        docs.forEach(callback);
      }
    };
  }
  
  try {
    return await realFS.getDocs(queryObj);
  } catch (err: any) {
    if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
      console.warn("[Firestore Fallback] Quota exceeded on getDocs! Switching to API Fallback.");
      firestoreExhausted = true;
      return getDocs(queryObj);
    }
    throw err;
  }
}

export async function getDoc(docRef: any): Promise<any> {
  if (firestoreExhausted || (docRef && docRef.type === "document")) {
    let path = docRef.path;
    let id = docRef.id;
    if (path && path.includes("/")) {
      const parts = path.split("/");
      id = parts[parts.length - 1];
      path = parts.slice(0, -1).join("/");
    }
    let data: any = null;
    
    try {
      if (path === "settings" && id === "branding") {
        const stored = localStorage.getItem("fallback_firestore_settings/branding");
        if (stored) {
          try {
            data = JSON.parse(stored);
          } catch (e) {
            console.error("[Firestore Fallback] Error parsing branding from localStorage:", e);
          }
        }
        if (!data) {
          data = {
            companyName: "Connect",
            logoBase64: null,
            logoType: null
          };
        }
      } else if (path === "tickets") {
        const res = await fetch(`/api/tickets/${id}`);
        if (res.ok) {
          const dbTicket = await res.json();
          data = mapDbTicketToFrontend(dbTicket);
        }
      }
    } catch (e) {
      console.error("[Firestore Fallback] getDoc error:", e);
    }
    
    return {
      id: id,
      exists: () => data !== null,
      data: () => data
    };
  }
  
  try {
    return await realFS.getDoc(docRef);
  } catch (err: any) {
    if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
      console.warn("[Firestore Fallback] Quota exceeded on getDoc! Switching to API Fallback.");
      firestoreExhausted = true;
      return getDoc(docRef);
    }
    throw err;
  }
}

export async function getDocFromServer(docRef: any): Promise<any> {
  return getDoc(docRef);
}

export function onSnapshot(
  queryOrDoc: any,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
): () => void {
  const isDoc = queryOrDoc && (queryOrDoc.type === "document" || queryOrDoc instanceof realFS.DocumentReference);
  
  if (firestoreExhausted || (queryOrDoc && (queryOrDoc.type === "query" || queryOrDoc.type === "collection" || queryOrDoc.type === "document"))) {
    let active = true;
    let timerId: any = null;
    
    const runPoll = async () => {
      if (!active) return;
      try {
        if (isDoc) {
          const snap = await getDoc(queryOrDoc);
          if (active) onNext(snap);
        } else {
          const snap = await getDocs(queryOrDoc);
          if (active) onNext(snap);
        }
      } catch (err) {
        console.error("[Firestore Fallback] onSnapshot poll error:", err);
        if (active && onError) onError(err);
      }
    };
    
    runPoll();
    timerId = setInterval(runPoll, 5000);
    
    const listenerRecord = {
      queryOrDoc,
      onNext,
      active: () => active,
      trigger: runPoll
    };
    activeListeners.push(listenerRecord);
    
    return () => {
      active = false;
      if (timerId) clearInterval(timerId);
      const idx = activeListeners.indexOf(listenerRecord);
      if (idx !== -1) activeListeners.splice(idx, 1);
    };
  }
  
  let unsub: () => void;
  try {
    unsub = realFS.onSnapshot(
      queryOrDoc,
      (snap) => {
        onNext(snap);
      },
      (err: any) => {
        if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
          console.warn("[Firestore Fallback] Quota exceeded on onSnapshot! Switching to API Fallback.");
          firestoreExhausted = true;
          if (unsub) unsub();
          const fallbackUnsub = onSnapshot(queryOrDoc, onNext, onError);
          unsub = fallbackUnsub;
        } else {
          if (onError) onError(err);
        }
      }
    );
    
    return () => {
      if (unsub) unsub();
    };
  } catch (err: any) {
    console.warn("[Firestore Fallback] onSnapshot failed, using fallback:", err.message);
    firestoreExhausted = true;
    return onSnapshot(queryOrDoc, onNext, onError);
  }
}

export async function addDoc(collectionRef: any, data: any): Promise<any> {
  if (firestoreExhausted || (collectionRef && collectionRef.type === "collection")) {
    const path = collectionRef.path;
    console.log(`[Firestore Fallback] addDoc to "${path}":`, data);
    
    if (path === "tickets") {
      const res = await fetch("/api/tickets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to create ticket via fallback API");
      const created = await res.json();
      return { id: String(created.id) };
    }
    
    return { id: "mock_id_" + Date.now() };
  }
  
  try {
    return await realFS.addDoc(collectionRef, data);
  } catch (err: any) {
    if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
      firestoreExhausted = true;
      return addDoc(collectionRef, data);
    }
    throw err;
  }
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  if (firestoreExhausted || (docRef && docRef.type === "document")) {
    let path = docRef.path;
    let id = docRef.id;
    if (path && path.includes("/")) {
      const parts = path.split("/");
      id = parts[parts.length - 1];
      path = parts.slice(0, -1).join("/");
    }
    console.log(`[Firestore Fallback] updateDoc on "${path}/${id}":`, data);
    
    if (path === "tickets") {
      const payload = { ...data };
      if (payload.slaDelayMeta !== undefined) {
        payload.sla_delay_meta_json = payload.slaDelayMeta;
        delete payload.slaDelayMeta;
      }
      if (payload.slaDelayLogs !== undefined) {
        payload.sla_delay_logs_json = payload.slaDelayLogs;
        delete payload.slaDelayLogs;
      }
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to update ticket via fallback API");
      return;
    }
    return;
  }
  
  try {
    await realFS.updateDoc(docRef, data);
  } catch (err: any) {
    if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
      firestoreExhausted = true;
      return updateDoc(docRef, data);
    }
    throw err;
  }
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  if (firestoreExhausted || (docRef && docRef.type === "document")) {
    let path = docRef.path;
    let id = docRef.id;
    if (path && path.includes("/")) {
      const parts = path.split("/");
      id = parts[parts.length - 1];
      path = parts.slice(0, -1).join("/");
    }
    console.log(`[Firestore Fallback] setDoc on "${path}/${id}":`, data, options);
    
    if (path === "users") {
      await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } else if (path === "settings" && id === "branding") {
      const stored = localStorage.getItem("fallback_firestore_settings/branding");
      let currentData = { companyName: "Connect", logoBase64: null, logoType: null };
      if (stored) {
        try {
          currentData = JSON.parse(stored);
        } catch {}
      }
      const newData = { ...currentData, ...data };
      localStorage.setItem("fallback_firestore_settings/branding", JSON.stringify(newData));
      notifyListeners("settings", "branding");
    }
    return;
  }
  
  try {
    await realFS.setDoc(docRef, data, options);
  } catch (err: any) {
    if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
      firestoreExhausted = true;
      return setDoc(docRef, data, options);
    }
    throw err;
  }
}

export async function deleteDoc(docRef: any): Promise<void> {
  if (firestoreExhausted || (docRef && docRef.type === "document")) {
    let path = docRef.path;
    let id = docRef.id;
    if (path && path.includes("/")) {
      const parts = path.split("/");
      id = parts[parts.length - 1];
      path = parts.slice(0, -1).join("/");
    }
    console.log(`[Firestore Fallback] deleteDoc on "${path}/${id}"`);
    
    if (path === "tickets") {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete ticket via fallback API");
      return;
    }
    return;
  }
  
  try {
    await realFS.deleteDoc(docRef);
  } catch (err: any) {
    if (err.message?.includes("Quota exceeded") || err.message?.includes("resource-exhausted")) {
      firestoreExhausted = true;
      return deleteDoc(docRef);
    }
    throw err;
  }
}

// Re-export other things
export function serverTimestamp() {
  if (firestoreExhausted) return new Date().toISOString();
  return realFS.serverTimestamp();
}

export function increment(n: number) {
  if (firestoreExhausted) return { type: 'increment', value: n };
  return realFS.increment(n);
}

export function writeBatch(db: any) {
  if (firestoreExhausted) {
    return {
      set: () => {},
      update: () => {},
      delete: () => {},
      commit: async () => {}
    };
  }
  return realFS.writeBatch(db);
}

export function initializeFirestore(...args: any[]): any {
  try {
    return (realFS.initializeFirestore as any)(...args);
  } catch (e) {
    console.warn("[Firestore Fallback] Failed to initialize real Firestore, using fallback.");
    firestoreExhausted = true;
    return {};
  }
}

// Star re-export for types and classes
export * from "@firebase/firestore";
