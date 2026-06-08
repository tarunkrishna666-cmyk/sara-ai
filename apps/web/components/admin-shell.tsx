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

const sections: Array<{ name: Section; icon: typeof Activity; endpoint: string }> = [
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
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // GET CURRENT USER
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((currentUser) => {
        if (!["admin", "super_admin"].includes(currentUser.role)) {
          window.location.replace("/chat");
          return;
        }
        sessionStorage.setItem("sara:user", JSON.stringify(currentUser));
        setUser(currentUser);
      })
      .catch(() => window.location.replace("/"))
      .finally(() => setAuthReady(true));
  }, []);

  // LOAD ADMIN DATA
  useEffect(() => {
    if (!authReady || !user) return;

    const endpoint =
      sections.find((item) => item.name === section)?.endpoint || "/dashboard";

    setData(null);
    setError("");

    fetch(`${API_URL}/api${endpoint}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Admin access denied");
      });
  }, [authReady, user, section, refreshKey]);

  // LOGOUT
  async function logout() {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);

    sessionStorage.removeItem("sara:user");
    window.location.assign("/");
  }

  if (!authReady || !user) {
    return (
      <main className="auth-page">
        <div className="auth-logo animate-pulse">
          <Bot className="h-7 w-7 text-[var(--primary)]" />
        </div>
      </main>
    );
  }

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <div className="flex items-center gap-3 px-2">
          <Bot className="h-7 w-7 text-[var(--primary)]" />
          <div>
            <p className="font-semibold">sarA Admin</p>
            <p className="text-xs text-[var(--muted)]">{user.role}</p>
          </div>
        </div>

        <nav className="mt-7 grid gap-1">
          {sections.map(({ name, icon: Icon }) => (
            <button
              key={name}
              type="button"
              onClick={() => setSection(name)}
              className={`nav-item ${section === name ? "nav-item-active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              <span>{name}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => void logout()}
          className="danger-button mt-auto"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Role-based administration</p>
            <h1 className="page-title">{section}</h1>
          </div>
          <div className="status-pill">
            <UserCog className="h-4 w-4" />
            {user.identifier}
          </div>
        </header>

        {error ? (
          <div className="error-banner rounded-2xl p-4">{error}</div>
        ) : null}

        <AdminContent
          section={section}
          data={data}
          user={user}
          onRefresh={() => setRefreshKey((v) => v + 1)}
        />
      </section>
    </main>
  );
}

/* ---------------- CONTENT ---------------- */

function AdminContent({
  section,
  data,
  user,
  onRefresh,
}: {
  section: Section;
  data: unknown;
  user: User | null;
  onRefresh: () => void;
}) {
  if (!data)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-36 rounded-3xl" />
        ))}
      </div>
    );

  if (Array.isArray(data))
    return <DataTable rows={data as Array<Record<string, unknown>>} />;

  return <ObjectCards data={data as Record<string, unknown>} />;
}

/* ---------------- TABLE ---------------- */

function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <pre
          key={String(row.id || i)}
          className="content-card overflow-x-auto whitespace-pre-wrap text-xs leading-6"
        >
          {JSON.stringify(row, null, 2)}
        </pre>
      ))}
    </div>
  );
}

/* ---------------- CARDS ---------------- */

function ObjectCards({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(data).map(([key, value]) => (
        <article key={key} className="metric-card">
          <p className="text-sm text-[var(--muted)] capitalize">
            {key.replaceAll("_", " ")}
          </p>
          <p className="mt-4 text-2xl font-semibold break-words">
            {typeof value === "object"
              ? JSON.stringify(value)
              : String(value)}
          </p>
        </article>
      ))}
    </div>
  );
}
