"use client";

import { Bot, Database, Download, LogOut, Monitor, Moon, Radio, Sun, UserRound } from "lucide-react";

import type { BrainStatus, ThemeMode, User } from "@/lib/types";

export function WorkspaceSettings({
  user,
  theme,
  status,
  setTheme,
  onLogout,
}: {
  user: User;
  theme: ThemeMode;
  status: BrainStatus | null;
  setTheme: (theme: ThemeMode) => void;
  onLogout: () => Promise<void>;
}) {
  const brains = [
    { label: "Groq", value: status?.groq, icon: Radio },
    { label: "OpenRouter", value: status?.openrouter, icon: Bot },
    { label: "Ollama", value: status?.ollama, icon: Bot },
    { label: "Database", value: status?.database, icon: Database },
  ];
  const openInstall = () => window.dispatchEvent(new Event("sara:open-install"));

  return (
    <div className="view-scroll max-w-5xl">
      <p className="eyebrow">Workspace preferences</p>
      <h2 className="page-title">Settings</h2>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <section className="content-card">
          <p className="card-title">Profile</p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
              <UserRound className="h-6 w-6" />
            </div>
            <div className="min-w-0"><p className="truncate font-semibold">{user.display_name}</p><p className="truncate text-sm text-[var(--muted)]">{user.identifier}</p></div>
          </div>
          <button type="button" onClick={onLogout} className="danger-button mt-6"><LogOut className="h-4 w-4" />Log out</button>
        </section>

        <section className="content-card">
          <p className="card-title">Appearance</p>
          <p className="card-subtitle">Choose the interface that feels right.</p>
          <div className="mt-5 grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
            <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")} icon={Moon} label="Dark" />
            <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} icon={Sun} label="Light" />
            <ThemeButton active={theme === "system"} onClick={() => setTheme("system")} icon={Monitor} label="System" />
          </div>
        </section>
      </div>

      <section className="content-card mt-5">
        <p className="card-title">Install web app</p>
        <p className="card-subtitle">Add sarA to your desktop, Android home screen, or iPhone home screen.</p>
        <button type="button" onClick={openInstall} className="primary-action mt-5 inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold text-white">
          <Download className="h-4 w-4" />
          Install app
        </button>
      </section>

      <section className="content-card mt-5">
        <p className="card-title">Brain status</p>
        <p className="card-subtitle">Live configuration reported by the sarA backend.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {brains.map(({ label, value, icon: Icon }) => (
            <div key={label} className="status-row">
              <div className="flex items-center gap-3"><Icon className="h-4 w-4 text-[var(--primary)]" /><span className="text-sm font-medium">{label}</span></div>
              <span className={`status-dot-label ${value === "online" || value === "configured" ? "status-online" : "status-offline"}`}>{value || "checking"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="content-card mt-5">
        <p className="card-title">Memory settings</p>
        <p className="card-subtitle">sarA keeps conversation context private to your signed-in profile.</p>
        <div className="mt-5 status-row">
          <span className="text-sm font-medium">Conversation memory</span>
          <span className="status-dot-label status-online">Enabled</span>
        </div>
      </section>
    </div>
  );
}

function ThemeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Moon; label: string }) {
  return <button type="button" onClick={onClick} className={`setting-choice ${active ? "setting-choice-active" : ""}`}><Icon className="h-4 w-4" />{label}</button>;
}
