"use client";

import { Activity, Bot, Clock3, MessageSquareText, Sparkles } from "lucide-react";

import type { Conversation } from "@/lib/types";

export function DashboardView({
  conversations,
  activeBrain,
}: {
  conversations: Conversation[];
  activeBrain: string;
}) {
  const metrics = [
    { label: "Total conversations", value: conversations.length, icon: MessageSquareText, tone: "cyan" },
    { label: "Active users", value: 1, icon: Activity, tone: "violet" },
    { label: "AI brain status", value: activeBrain, icon: Bot, tone: "emerald" },
    { label: "Response time", value: "< 1s", icon: Clock3, tone: "amber" },
  ];

  return (
    <div className="view-scroll">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">A live snapshot of your sarA workspace.</p>
        </div>
        <div className="status-pill">
          <Sparkles className="h-4 w-4" />
          Active brain: {activeBrain}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="metric-card">
            <div className={`metric-icon metric-${tone}`}><Icon className="h-5 w-5" /></div>
            <p className="mt-6 break-words text-2xl font-semibold tracking-tight 2xl:text-3xl">{value}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{label}</p>
          </article>
        ))}
      </div>

      <section className="content-card mt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="card-title">Recent activity</p>
            <p className="card-subtitle">Your latest assistant threads</p>
          </div>
          <Activity className="h-5 w-5 text-[var(--primary)]" />
        </div>
        <div className="mt-5 grid gap-3">
          {conversations.slice(0, 5).map((conversation) => (
            <div key={conversation.id} className="activity-row">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{conversation.title}</p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">{conversation.last_message}</p>
              </div>
              <span className="text-xs text-[var(--muted)]">
                {new Date(`${conversation.updated_at}Z`).toLocaleDateString()}
              </span>
            </div>
          ))}
          {!conversations.length ? <EmptyLine text="Your activity will appear here." /> : null}
        </div>
      </section>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="empty-line">{text}</div>;
}
