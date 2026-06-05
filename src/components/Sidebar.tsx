import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
  LogOut,
  CheckSquare,
  BarChart3,
  History,
  Clock,
  Search,
  ChevronRight,
  ChevronDown,
  PlusCircle,
  UserCheck,
  FolderOpen,
  UserMinus,
  CheckCircle2,
  List,
  Map,
  Settings2,
  ChevronLeft,
  Menu,
  Sun,
  Moon,
  ShoppingCart,
  Database,
  AlertOctagon,
  GitPullRequest,
  BookOpen,
  HelpCircle,
  BarChart2,
  ClipboardList,
  CalendarDays,
  Trophy,
  Building2,
  KeyRound,
  Monitor,
  Palette,
  Tag,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "../contexts/AuthContext";
import { useTickets } from "../contexts/TicketsContext";
import { useBranding } from "../contexts/BrandingContext";
import { useTheme } from "../contexts/ThemeContext";

interface MenuItem {
  icon?: any;
  label: string;
  path?: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  ultraSuperAdminOnly?: boolean;
  items?: MenuItem[];
  badge?: number;
}

export function Sidebar() {
  const { profile, signOut } = useAuth();
  const { openTicketsCount, assignedToMeCount } = useTickets();
  const { branding } = useBranding();
  const { setTheme, resolvedTheme } = useTheme();
  const location = useLocation();

  const isDarkMode = resolvedTheme === "dark";
  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    const saved = localStorage.getItem("sn-sidebar-expanded");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Auto-expand "Data Analytics" for existing users who don't have it yet
      if (!parsed.includes("Data Analytics")) {
        parsed.push("Data Analytics");
      }
      return parsed;
    }
    return ["Favorites", "Incident", "Data Analytics"];
  });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    localStorage.setItem("sn-sidebar-expanded", JSON.stringify(expandedSections));
  }, [expandedSections]);

  const menuStructure: MenuItem[] = [
    {
      label: "Favorites",
      items: profile?.role === "user"
        ? [
          { icon: LayoutDashboard, label: "Personal Dashboard", path: "/my-dashboard" },
          { icon: Trophy, label: "Leaderboard", path: "/leaderboard" },
          { icon: CalendarDays, label: "Calendar", path: "/calendar" },
          { icon: Ticket, label: "My Tickets", path: "/timesheet" },
          { icon: BarChart2, label: "Timesheet Reports", path: "/timesheet/reports" },
          { icon: Monitor, label: "AI Activity Tracker", path: "/activity-tracker" },
        ]
        : [
          { icon: LayoutDashboard, label: "Personal Dashboard", path: "/" },
          { icon: Trophy, label: "Leaderboard", path: "/leaderboard" },
          { icon: CalendarDays, label: "Calendar", path: "/calendar" },
          { icon: Ticket, label: "My Tickets", path: "/timesheet" },
          { icon: BarChart2, label: "Timesheet Reports", path: "/timesheet/reports" },
          { icon: Monitor, label: "AI Activity Tracker", path: "/activity-tracker" },
        ]
    },
    {
      label: "Email Integration",
      ultraSuperAdminOnly: true,
      items: [
        { icon: Settings, label: "Email Integration", path: "/email-integrations" },
      ]
    },
    {
      label: "Companies",
      ultraSuperAdminOnly: true,
      items: [
        { icon: Building2, label: "Companies", path: "/companies" },
      ]
    },
    {
      label: "Service Desk",
      items: [
        { icon: ShoppingCart, label: "Service Catalog", path: "/catalog" },
        { icon: BookOpen, label: "Knowledge Base", path: "/kb" },
        { icon: Clock, label: "SLA Policies", path: "/sla" },
        { icon: History, label: "System Activity Log", path: "/history" },
      ]
    },
    {
      label: "Incident",
      items: [
        { icon: PlusCircle, label: "Create New Incident", path: "/tickets?action=new" },
        { icon: UserCheck, label: "Assigned to Me", path: "/tickets?filter=assigned_to_me", badge: assignedToMeCount },
        { icon: FolderOpen, label: "Open Incidents", path: "/tickets?filter=open", badge: openTicketsCount },
        { icon: UserMinus, label: "Open - Unassigned", path: "/tickets?filter=unassigned" },
        { icon: CheckCircle2, label: "Resolved Incidents", path: "/tickets?filter=resolved" },
        { icon: List, label: "All Incidents", path: "/tickets" },
        { icon: Map, label: "Critical Incidents Map", path: "/reports" },
      ]
    },
    {
      label: "Problem & Change",
      items: [
        { icon: AlertOctagon, label: "Problem Management", path: "/problem" },
        { icon: GitPullRequest, label: "Change Management", path: "/change" },
      ]
    },
    {
      label: "Meetings",
      items: [
        { icon: CalendarDays, label: "Meeting Management", path: "/meetings" },
        { icon: PlusCircle,   label: "Create Meeting",     path: "/create-meeting" },
      ]
    },
    {
      label: "Data Analytics",
      adminOnly: true,
      items: [
        { icon: BarChart3, label: "Data Analytics", path: "/data-analytics" },
      ]
    },
    {
      label: "System Administration",
      adminOnly: true,
      items: [
        { icon: Users, label: "User Management", path: "/users" },
        { icon: KeyRound, label: "Access Control", path: "/access-control" },
        { icon: Users, label: "Group Management", path: "/groups" },
        { icon: Settings2, label: "System Settings", path: "/settings" },
        { icon: CheckCircle2, label: "Approved Tickets", path: "/approved-tickets" },
        { icon: ClipboardList, label: "Ticket Approvals", path: "/timesheet-approvals" },
        { icon: CheckCircle2, label: "Approved Timesheets", path: "/timesheet/reports?status=Approved" },
        { icon: Palette, label: "Branding", path: "/branding", superAdminOnly: true },
        { icon: Tag, label: "Incident Category Management", path: "/incident-categories" },
      ]
    }
  ];

  const toggleSection = (label: string) => {
    setExpandedSections(prev =>
      prev.includes(label) ? prev.filter(s => s !== label) : [...prev, label]
    );
  };

  const filterItems = (items: MenuItem[]): MenuItem[] => {
    return items
      .map(item => {
        if (item.items) {
          const filteredSubItems = filterItems(item.items);
          if (filteredSubItems.length > 0 || item.label.toLowerCase().includes(searchQuery.toLowerCase())) {
            return { ...item, items: filteredSubItems };
          }
        } else if (item.label.toLowerCase().includes(searchQuery.toLowerCase())) {
          return item;
        }
        return null;
      })
      .filter(Boolean) as MenuItem[];
  };

  const hasAccess = (item: MenuItem) => {
    if (item.ultraSuperAdminOnly) return profile?.role === "ultra_super_admin";
    if (item.superAdminOnly) return profile?.role === "super_admin" || profile?.role === "ultra_super_admin";
    if (item.adminOnly) return profile?.role === "admin" || profile?.role === "super_admin" || profile?.role === "ultra_super_admin";
    return true;
  };

  const filteredMenu = filterItems(menuStructure).filter(hasAccess);

  return (
    <aside className={cn(
      "bg-sn-sidebar text-white flex flex-col sticky top-4 left-4 transition-all duration-300 border border-white/10 rounded-2xl m-4 mr-0 shadow-2xl z-20 overflow-hidden",
      isCollapsed ? "w-16" : "w-64",
      "h-[calc(100vh-2rem)]"
    )}>
      {/* Sidebar Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10 h-16 shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5">
            {branding.logoBase64 ? (
              <img
                src={branding.logoBase64}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-cover shadow-[0_0_10px_rgba(37,99,235,0.3)]"
              />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-blue-800 rounded-lg flex items-center justify-center font-outfit font-black text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]">
                {branding.companyName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-outfit font-black tracking-wider text-blue-600 dark:text-blue-400 uppercase truncate max-w-[140px]" title={branding.companyName}>
              {branding.companyName}
            </span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-all duration-200 cursor-pointer"
        >
          {isCollapsed ? <Menu className="w-4 h-4 text-blue-500" /> : <ChevronLeft className="w-4 h-4 text-text-dim hover:text-white" />}
        </button>
      </div>

      {/* Filter Navigator */}
      {!isCollapsed && (
        <div className="p-4 shrink-0">
          <div className="relative group">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Navigator search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white/10 focus:shadow-[0_0_12px_rgba(37,99,235,0.15)] transition-all placeholder:text-text-dim/60"
            />
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="flex-grow overflow-y-auto overflow-x-hidden custom-scrollbar py-2 px-2 space-y-1">
        {filteredMenu.map((section) => (
          <div key={section.label} className="mb-2">
            {!isCollapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[9px] font-outfit font-black uppercase tracking-widest text-text-dim/70 hover:text-white transition-colors group cursor-pointer"
              >
                <span>{section.label}</span>
                {expandedSections.includes(section.label) ? (
                  <ChevronDown className="w-3 h-3 text-blue-500/70 group-hover:text-blue-500" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-text-dim/50 group-hover:text-white" />
                )}
              </button>
            )}

            {(expandedSections.includes(section.label) || isCollapsed || searchQuery) && (
              <div className="space-y-0.5 mt-1">
                {section.items?.map((item) => (
                  <Link
                    key={item.label}
                    to={item.path || "#"}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl transition-all relative group cursor-pointer",
                      location.pathname === item.path
                        ? "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-r border-blue-500 shadow-[inset_0_0_12px_rgba(37,99,235,0.1)] font-semibold"
                        : "text-text-dim hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className={cn(
                      "w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                      location.pathname === item.path ? "text-blue-500 drop-shadow-[0_0_8px_rgba(37,99,235,0.6)]" : "text-text-dim group-hover:text-white"
                    )} />
                    {!isCollapsed && <span className="text-xs truncate flex-grow">{item.label}</span>}
                    {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className="bg-blue-600 text-white text-[10px] font-outfit font-black px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-[0_0_10px_rgba(37,99,235,0.3)]">
                        {item.badge}
                      </span>
                    )}

                    {isCollapsed && (
                      <div className="absolute left-16 bg-slate-950 border border-white/10 px-3 py-2 rounded-xl shadow-2xl text-[10px] uppercase font-bold tracking-wider whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 transform translate-x-2 group-hover:translate-x-0">
                        {item.label}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-white/10 space-y-1.5 shrink-0 bg-black/20">
        <button
          onClick={() => setTheme(isDarkMode ? "light" : "dark")}
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full text-text-dim hover:text-white transition-all duration-200 rounded-xl hover:bg-white/5 cursor-pointer text-xs",
            isCollapsed && "justify-center px-0"
          )}
        >
          {isDarkMode ? <Sun className="w-4 h-4 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" /> : <Moon className="w-4 h-4 text-blue-500" />}
          {!isCollapsed && <span>{isDarkMode ? "Light Spectrum" : "Dark Cyber Mode"}</span>}
        </button>
        <button
          onClick={() => signOut()}
          className={cn(
            "flex items-center gap-3 px-3 py-2 w-full text-text-dim hover:text-red-400 transition-all duration-200 rounded-xl hover:bg-red-500/10 cursor-pointer text-xs",
            isCollapsed && "justify-center px-0"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!isCollapsed && <span>System Logout</span>}
        </button>
      </div>
    </aside>
  );
}


