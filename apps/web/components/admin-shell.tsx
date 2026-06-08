"use client";

import { useEffect, useState } from "react";
import {
  Activity, Bot, BrainCircuit, Gauge, HeartPulse, LayoutDashboard, LogOut,
  MessageSquareText, Settings, ShieldCheck, SlidersHorizontal, UserCog, Users,
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

const sections = [
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

  // GET USER
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((u) => {
        if (!["admin", "super_admin"].includes(u.role)) {
          window.location.href = "/chat";
          return;
        }
        setUser(u);
      })
      .catch(() => (window.location.href = "/"))
      .finally(() => setReady(true));
  }, []);

  // LOAD DATA
  useEffect(() => {
    if (!ready || !user) return;

    const endpoint =
      sections.find((s) => s.name === section)?.endpoint || "/dashboard";

    setData(null);
    setError("");

    fetch(`${API_URL}/api${endpoint}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, [ready, user, section]);

  // LOGOUT
  async function logout() {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    sessionStorage.clear();
    window.location.href = "/";
  }

  if (!ready || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Bot className="animate-pulse h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* SIDEBAR */}
      <aside className="w-64 p-4 border-r">
        <div className="flex items-center gap-2 mb-6">
          <Bot />
          <span className="font-bold">sarA Admin</span>
        </div>

        {sections.map((s) => (
          <button
            key={s.name}
            onClick={() => setSection(s.name)}
            className="flex items-center gap-2 w-full p-2 text-left"
          >
            <s.icon className="h-4 w-4" />
            {s.name}
          </button>
        ))}

        <button
          onClick={logout}
          className="mt-6 flex items-center gap-2 text-red-500"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6">
        <h1 className="text-xl font-bold mb-4">{section}</h1>

        {error && <p className="text-red-500">{error}</p>}

        <pre className="bg-gray-100 p-4 rounded">
          {JSON.stringify(data, null, 2)}
        </pre>
      </main>
    </div>
  );
}
