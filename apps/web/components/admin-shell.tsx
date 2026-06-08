"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  BrainCircuit,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Settings,
  ShieldCheck,
} from "lucide-react";

import type { User } from "@/lib/types";

const API_URL = "https://sara-ai-wf20.onrender.com";

type Section =
  | "Dashboard"
  | "Users"
  | "Conversations"
  | "AI Brains"
  | "Rate Limits"
  | "Analytics"
  | "System Health"
  | "Logs"
  | "Settings";

interface SectionConfig {
  name: Section;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
}

const sections: SectionConfig[] = [
  { name: "Dashboard", icon: LayoutDashboard, endpoint: "/dashboard" },
  { name: "Users", icon: Users, endpoint: "/users" },
  { name: "Conversations", icon: MessageSquareText, endpoint: "/conversations" },
  { name: "AI Brains", icon: BrainCircuit, endpoint: "/brains" },
  { name: "Rate Limits", icon: Gauge, endpoint: "/rate-limits" },
  { name: "Analytics", icon: Activity, endpoint: "/analytics" },
  { name: "System Health", icon: HeartPulse, endpoint: "/system-health" },
  { name: "Logs", icon: ShieldCheck, endpoint: "/logs" },
  { name: "Settings", icon: Settings, endpoint: "/settings" },
];

export function AdminShell() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * GET CURRENT USER
   */
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((u) => {
        if (!u || !["admin", "super_admin"].includes(u.role)) {
          window.location.href = "/chat";
          return;
        }

        setUser(u);
        sessionStorage.setItem("sara:user", JSON.stringify(u));
      })
      .catch(() => {
        window.location.href = "/";
      })
      .finally(() => setReady(true));
  }, []);

  /**
   * LOAD SECTION DATA
   */
  useEffect(() => {
    if (!ready || !user) return;

    const endpoint =
      sections.find((s) => s.name === section)?.endpoint || "/dashboard";

    setData(null);
    setError("");

    fetch(`${API_URL}/api${endpoint}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(`Server returned status ${r.status}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load data");
      });
  }, [ready, user, section]);

  /**
   * LOGOUT
   */
  async function logout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      sessionStorage.clear();
      window.location.href = "/";
    }
  }

  if (!ready || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Bot className="animate-pulse h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white text-gray-900">
      {/* SIDEBAR */}
      <aside className="w-64 border-r p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-6 px-2">
            <Bot className="h-6 w-6 text-indigo-600" />
            <span className="font-bold text-lg">sarA Admin</span>
          </div>

          <nav className="space-y-1">
            {sections.map((s) => {
              const Icon = s.icon;
              const isActive = section === s.name;
              return (
                <button
                  key={s.name}
                  onClick={() => setSection(s.name)}
                  className={`flex items-center gap-2 w-full p-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {s.name}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          onClick={logout}
          className="mt-6 flex items-center gap-2 p-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 bg-gray-50 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-6">{section}</h1>

          {error && (
            <div className="p-4 mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="bg-white border rounded-lg shadow-sm p-4">
            {data ? (
              <pre className="text-xs font-mono text-gray-800 overflow-auto max-h-[70vh]">
                {JSON.stringify(data, null, 2)}
              </pre>
            ) : !error ? (
              <div className="text-sm text-gray-500 animate-pulse">Loading data...</div>
            ) : (
              <div className="text-sm text-gray-400">No data available</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
