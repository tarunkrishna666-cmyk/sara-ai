"use client";

import { useEffect, useState } from "react";
import {
  Activity, Bot, BrainCircuit, Gauge, HeartPulse, LayoutDashboard, LogOut,
  MessageSquareText, Settings, ShieldCheck, SlidersHorizontal, UserCog, Users,
} from "lucide-react";

import { adminRequest, clearAccessToken, getCurrentUser, logout as logoutSession } from "@/lib/api";
import type { User } from "@/lib/types";

type Section = "Dashboard" | "Users" | "Conversations" | "AI Brains" | "Rate Limits" | "Analytics" | "System Health" | "Logs" | "Settings";
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

  useEffect(() => {
    void getCurrentUser()
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

  useEffect(() => {
    if (!authReady || !user) return;
    const endpoint = sections.find((item) => item.name === section)?.endpoint || "/dashboard";
    setData(null);
    setError("");
    void adminRequest(endpoint).then(setData).catch((err) => {
      setError(err instanceof Error ? err.message : "Admin access denied");
      if (String(err).includes("required") || String(err).includes("access")) window.location.replace("/");
    });
  }, [authReady, user, section, refreshKey]);

  async function logout() {
    await logoutSession().catch(() => undefined);
    clearAccessToken();
    sessionStorage.removeItem("sara:user");
    window.location.assign("/");
  }

  if (!authReady || !user) {
    return <main className="auth-page"><div className="auth-logo animate-pulse"><Bot className="h-7 w-7 text-[var(--primary)]" /></div></main>;
  }

  return (
    <main className="admin-layout">
      <aside className="admin-sidebar">
        <div className="flex items-center gap-3 px-2"><Bot className="h-7 w-7 text-[var(--primary)]" /><div><p className="font-semibold">sarA Admin</p><p className="text-xs text-[var(--muted)]">{user?.role}</p></div></div>
        <nav className="mt-7 grid gap-1" aria-label="Admin sections">
          {sections.map(({ name, icon: Icon }) => <button key={name} type="button" onClick={() => setSection(name)} className={`nav-item ${section === name ? "nav-item-active" : ""}`}><Icon className="h-4 w-4" /><span>{name}</span></button>)}
        </nav>
        <button type="button" onClick={() => void logout()} className="danger-button mt-auto"><LogOut className="h-4 w-4" />Log out</button>
      </aside>
      <section className="admin-main">
        <header className="admin-header"><div><p className="eyebrow">Role-based administration</p><h1 className="page-title">{section}</h1></div><div className="status-pill"><UserCog className="h-4 w-4" />{user?.identifier}</div></header>
        {error ? <div className="error-banner rounded-2xl p-4">{error}</div> : null}
        <AdminContent section={section} data={data} user={user} onRefresh={() => setRefreshKey((value) => value + 1)} />
      </section>
    </main>
  );
}

function AdminContent({ section, data, user, onRefresh }: { section: Section; data: unknown; user: User | null; onRefresh: () => void }) {
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map((item) => <div key={item} className="skeleton h-36 rounded-3xl" />)}</div>;
  if (section === "Users" && Array.isArray(data)) return <UsersSection users={data as User[]} superAdmin={user?.role === "super_admin"} onRefresh={onRefresh} />;
  if (section === "AI Brains") return <EditableSettings data={data as Record<string, unknown>} endpoint="/brains" superAdmin={user?.role === "super_admin"} onRefresh={onRefresh} />;
  if (section === "Rate Limits") return <EditableSettings data={data as Record<string, unknown>} endpoint="/rate-limits" superAdmin={user?.role === "super_admin"} onRefresh={onRefresh} />;
  if (section === "Settings") return <EditableSettings data={data as Record<string, unknown>} endpoint="/settings" superAdmin={user?.role === "super_admin"} onRefresh={onRefresh} />;
  if (Array.isArray(data)) return <DataTable rows={data as Array<Record<string, unknown>>} />;
  return <ObjectCards data={data as Record<string, unknown>} />;
}

function UsersSection({ users, superAdmin, onRefresh }: { users: User[]; superAdmin: boolean; onRefresh: () => void }) {
  async function createAdmin() {
    const identifier = window.prompt("New admin email");
    if (!identifier?.trim()) return;
    const temporaryPassword = window.prompt("Temporary password (at least 8 characters)");
    if (!temporaryPassword || temporaryPassword.length < 8) return;
    await adminRequest("/users", {
      method: "POST",
      body: JSON.stringify({
        identifier: identifier.trim(),
        temporary_password: temporaryPassword,
      }),
    });
    onRefresh();
  }
  async function toggle(user: User) {
    await adminRequest(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !user.is_active }) });
    onRefresh();
  }
  async function role(user: User, nextRole: "user" | "admin") {
    await adminRequest(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ role: nextRole }) });
    onRefresh();
  }
  return <div className="grid gap-3">{superAdmin ? <button type="button" onClick={createAdmin} className="primary-action min-h-11 justify-self-start px-4 text-sm font-semibold text-white">Create admin</button> : null}{users.map((item) => <article key={item.id} className="content-card flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.display_name}</p><p className="truncate text-sm text-[var(--muted)]">{item.identifier} · {item.role} · {item.is_active ? "active" : "banned"}</p></div>{superAdmin && item.role !== "super_admin" ? <div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={() => role(item, item.role === "admin" ? "user" : "admin")}><SlidersHorizontal className="h-3.5 w-3.5" />{item.role === "admin" ? "Remove admin" : "Make admin"}</button><button className="secondary-button text-[var(--rose)]" onClick={() => toggle(item)}>{item.is_active ? "Ban" : "Unban"}</button></div> : null}</article>)}</div>;
}

function ObjectCards({ data }: { data: Record<string, unknown> }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data).map(([key, value]) => <article key={key} className="metric-card"><p className="text-sm capitalize text-[var(--muted)]">{key.replaceAll("_", " ")}</p><p className="mt-4 break-words text-2xl font-semibold">{typeof value === "object" ? JSON.stringify(value) : String(value)}</p></article>)}</div>;
}

function EditableSettings({ data, endpoint, superAdmin, onRefresh }: { data: Record<string, unknown>; endpoint: string; superAdmin: boolean; onRefresh: () => void }) {
  async function edit(key: string, currentValue: unknown) {
    const value = window.prompt(`Set ${key}`, typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue ?? ""));
    if (value === null) return;
    const path = endpoint === "/settings" ? endpoint : `${endpoint}/${encodeURIComponent(key)}`;
    await adminRequest(path, { method: "PATCH", body: JSON.stringify({ key, value }) });
    onRefresh();
  }

  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data).map(([key, value]) => <article key={key} className="metric-card"><div className="flex items-start justify-between gap-3"><p className="text-sm capitalize text-[var(--muted)]">{key.replaceAll("_", " ")}</p>{superAdmin ? <button type="button" className="secondary-button" onClick={() => void edit(key, value)}>Edit</button> : null}</div><p className="mt-4 break-words text-lg font-semibold">{typeof value === "object" ? JSON.stringify(value) : String(value)}</p></article>)}</div>;
}

function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return <div className="grid gap-3">{rows.map((row, index) => <pre key={String(row.id || index)} className="content-card overflow-x-auto whitespace-pre-wrap text-xs leading-6">{JSON.stringify(row, null, 2)}</pre>)}</div>;
}
