"use client";

import { Bookmark, Brain, Clock3, ShieldCheck } from "lucide-react";

import type { Conversation, Message, User } from "@/lib/types";

export function MemoryView({
  user,
  conversations,
  messages,
}: {
  user: User;
  conversations: Conversation[];
  messages: Message[];
}) {
  const recent = messages.filter((message) => message.role === "user").slice(-5).reverse();

  return (
    <div className="view-scroll">
      <p className="eyebrow">Personal context</p>
      <h2 className="page-title">Memory</h2>
      <p className="page-subtitle">Context sarA can use inside your private workspace.</p>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <section className="content-card">
          <Header icon={Clock3} title="Recent memories" subtitle="Recent prompts from this conversation" />
          <div className="mt-5 grid gap-3">
            {recent.map((message) => (
              <div key={message.id} className="memory-row">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                <p className="line-clamp-2 text-sm leading-6">{message.content}</p>
              </div>
            ))}
            {!recent.length ? <div className="empty-line">Start chatting to create recent memories.</div> : null}
          </div>
        </section>

        <div className="grid gap-5">
          <section className="content-card">
            <Header icon={Bookmark} title="Saved context" subtitle="Workspace-level context" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MemoryStat value={conversations.length} label="Saved chats" />
              <MemoryStat value={messages.length} label="Loaded messages" />
            </div>
          </section>
          <section className="content-card">
            <Header icon={ShieldCheck} title="User preferences" subtitle="Private to this profile" />
            <dl className="mt-5 space-y-3 text-sm">
              <Preference label="Profile" value={user.display_name} />
              <Preference label="Theme" value={user.theme} />
              <Preference label="Memory scope" value="Per user" />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Header({ icon: Icon, title, subtitle }: { icon: typeof Clock3; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="metric-icon metric-violet"><Icon className="h-5 w-5" /></div>
      <div><p className="card-title">{title}</p><p className="card-subtitle">{subtitle}</p></div>
    </div>
  );
}

function MemoryStat({ value, label }: { value: number; label: string }) {
  return <div className="soft-card"><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[var(--muted)]">{label}</p></div>;
}

function Preference({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"><dt className="text-[var(--muted)]">{label}</dt><dd className="font-medium capitalize">{value}</dd></div>;
}
