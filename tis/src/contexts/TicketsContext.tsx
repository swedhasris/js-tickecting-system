import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./AuthContext";

interface Ticket {
  id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  assignedTo?: string;
  assignedToName?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

interface TicketsContextType {
  tickets: Ticket[];
  openTicketsCount: number;
  assignedToMeCount: number;
  loading: boolean;
  error: string | null;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

export function useTickets() {
  const context = useContext(TicketsContext);
  if (context === undefined) {
    throw new Error("useTickets must be used within a TicketsProvider");
  }
  return context;
}

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const ticketsRef = collection(db, "tickets");

    // All users (including regular users) see all open tickets
    const q = query(ticketsRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ticketsData = snapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Ticket))
          .filter(t => !["Resolved", "Closed"].includes(t.status));
        setTickets(ticketsData);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching tickets:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const openTicketsCount = tickets.length;
  const assignedToMeCount = tickets.filter(t => 
    t.assignedTo === user?.uid || 
    t.assignedTo === profile?.name
  ).length;

  const value: TicketsContextType = {
    tickets,
    openTicketsCount,
    assignedToMeCount,
    loading,
    error,
  };

  return (
    <TicketsContext.Provider value={value}>
      {children}
    </TicketsContext.Provider>
  );
}
