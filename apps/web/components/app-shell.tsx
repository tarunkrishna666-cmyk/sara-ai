"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Bot,
  Check,
  Copy,
  Download,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  BrainCircuit,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { LoginScreen } from "@/components/login-screen";
import { SceneBackground } from "@/components/scene-background";
import {
  deleteConversation,
  clearAccessToken,
  getBrainStatus,
  getConversations,
  getCurrentUser,
  getMessages,
  logout as logoutSession,
  renameConversation,
  storeAccessToken,
  streamChatMessage,
} from "@/lib/api";
import type { AuthResponse, BrainStatus, Conversation, Message, ThemeMode, User } from "@/lib/types";

type ViewMode = "chat" | "dashboard" | "memory" | "history" | "settings";

const STORAGE_USER = "sara:user";
const STORAGE_THEME = "sara:theme";
const DashboardView = dynamic(
  () => import("@/components/dashboard-view").then((module) => module.DashboardView),
  { loading: () => <PageSkeleton /> },
);
const MemoryView = dynamic(
  () => import("@/components/memory-view").then((module) => module.MemoryView),
  { loading: () => <PageSkeleton /> },
);
const WorkspaceSettings = dynamic(
  () => import("@/components/workspace-settings").then((module) => module.WorkspaceSettings),
  { loading: () => <PageSkeleton /> },
);

function PageSkeleton() {
  return (
    <div className="view-scroll">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-4 h-10 w-64" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-36 rounded-3xl" />)}
      </div>
    </div>
  );
}

function formatTime(value: string) {
  const normalized = value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}

function createClientId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createTempMessage(
  user: User,
  conversationId: string,
  role: Message["role"],
  content: string,
): Message {
  return {
    id: `temp-${createClientId()}`,
    conversation_id: conversationId,
    user_id: user.id,
    role,
    content,
    created_at: new Date().toISOString(),
  };
}

export function AppShell() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [view, setView] = useState<ViewMode>("chat");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamControllerRef = useRef<AbortController | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations],
  );

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(term) ||
        conversation.last_message?.toLowerCase().includes(term),
    );
  }, [conversations, search]);

  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_THEME) as ThemeMode | null;
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      setTheme(storedTheme);
    }

    void getCurrentUser()
      .then((currentUser) => {
        sessionStorage.setItem(STORAGE_USER, JSON.stringify(currentUser));
        setUser(currentUser);
      })
      .catch(() => {
        sessionStorage.removeItem(STORAGE_USER);
        clearAccessToken();
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_THEME, theme);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "super_admin") {
      window.location.replace("/admin");
      return;
    }
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/chat");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refreshConversations(user.id);
    void getBrainStatus().then(setBrainStatus).catch(() => setBrainStatus(null));
  }, [user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    function closeDrawer(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", closeDrawer);
    return () => window.removeEventListener("keydown", closeDrawer);
  }, []);

  async function refreshConversations(userId: string) {
    setLoading(true);
    setError("");
    try {
      const items = await getConversations(userId);
      setConversations(items);
      if (!activeConversationId && items[0]) {
        setActiveConversationId(items[0].id);
        setMessages(await getMessages(items[0].id, userId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversations");
    } finally {
      setLoading(false);
    }
  }

  function handleAuthenticated(result: AuthResponse) {
    sessionStorage.setItem(STORAGE_USER, JSON.stringify(result.user));
    storeAccessToken(result.access_token);
    if (result.user.role === "admin" || result.user.role === "super_admin") {
      window.location.assign("/admin");
      return;
    }
    window.history.replaceState({}, "", "/chat");
    setUser(result.user);
  }

  async function handleLogout() {
    streamControllerRef.current?.abort();
    await logoutSession().catch(() => undefined);
    sessionStorage.removeItem(STORAGE_USER);
    clearAccessToken();
    setUser(null);
    setConversations([]);
    setMessages([]);
    setActiveConversationId(null);
    setDraft("");
  }

  async function handleNewChat() {
    streamControllerRef.current?.abort();
    setError("");
    setActiveConversationId(null);
    setMessages([]);
    setDraft("");
    setView("chat");
    setMobileMenuOpen(false);
  }

  async function handleSelectConversation(conversationId: string) {
    if (!user) return;
    streamControllerRef.current?.abort();
    setError("");
    try {
      const nextMessages = await getMessages(conversationId, user.id);
      setActiveConversationId(conversationId);
      setMessages(nextMessages);
      setView("chat");
      setMobileMenuOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversation");
    }
  }

  async function handleRenameConversation(conversation: Conversation) {
    if (!user) return;
    const title = window.prompt("Rename conversation", conversation.title)?.trim();
    if (!title || title === conversation.title) return;
    try {
      const updated = await renameConversation(conversation.id, user.id, title);
      setConversations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rename conversation");
    }
  }

  async function handleDeleteConversation(conversation: Conversation) {
    if (!user || !window.confirm(`Delete "${conversation.title}"?`)) return;
    try {
      await deleteConversation(conversation.id, user.id);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (activeConversationId === conversation.id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete conversation");
    }
  }

  async function handleSend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!user || !draft.trim() || sending) return;

    const content = draft.trim();
    const conversationId = activeConversationId || `pending-${createClientId()}`;
    const assistantTempId = `temp-${createClientId()}`;
    setDraft("");
    setSending(true);
    setStreamingMessageId(null);
    setError("");

    const optimistic = createTempMessage(user, conversationId, "user", content);
    setMessages((current) => [...current, optimistic]);

    let readyReceived = false;
    const controller = new AbortController();
    streamControllerRef.current = controller;

    try {
      const response = await streamChatMessage(
        user.id,
        content,
        activeConversationId || undefined,
        {
          onReady: ({ conversation, user_message }) => {
            readyReceived = true;
            setActiveConversationId(conversation.id);
            setStreamingMessageId(assistantTempId);
            setMessages((current) => [
              ...current.filter((item) => item.id !== optimistic.id),
              user_message,
              createTempMessage(user, conversation.id, "assistant", ""),
            ].map((item) => (
              item.role === "assistant" && item.content === ""
                ? { ...item, id: assistantTempId }
                : item
            )));
            setConversations((current) => {
              const rest = current.filter((item) => item.id !== conversation.id);
              return [conversation, ...rest];
            });
          },
          onToken: (token) => {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantTempId
                  ? { ...item, content: `${item.content}${token}` }
                  : item,
              ),
            );
          },
          onFinal: (finalResponse) => {
            setActiveConversationId(finalResponse.conversation.id);
            setMessages(finalResponse.messages);
            setConversations((current) => {
              const rest = current.filter((item) => item.id !== finalResponse.conversation.id);
              return [finalResponse.conversation, ...rest];
            });
          },
        },
        controller.signal,
      );
      setActiveConversationId(response.conversation.id);
      setMessages(response.messages);
      setConversations((current) => {
        const rest = current.filter((item) => item.id !== response.conversation.id);
        return [response.conversation, ...rest];
      });
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setMessages((current) =>
        current.filter((item) =>
          readyReceived ? item.id !== assistantTempId : item.id !== optimistic.id,
        ),
      );
      setDraft(content);
      setError(err instanceof Error ? err.message : "sarA could not reply");
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
      }
      setSending(false);
      setStreamingMessageId(null);
    }
  }

  function handleStop() {
    streamControllerRef.current?.abort();
  }

  if (!authReady) {
    return (
      <main className="auth-page">
        <div className="auth-logo animate-pulse">
          <Image src="/sara-logo.png" alt="sarA" width={56} height={56} priority unoptimized />
        </div>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  const navItems: Array<{ id: ViewMode; label: string; icon: typeof MessageCircle }> = [
    { id: "chat", label: "Chat", icon: MessageCircle },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "memory", label: "Memory", icon: BrainCircuit },
    { id: "history", label: "History", icon: History },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <main className="app-shell relative flex overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <SceneBackground />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(120deg,rgba(6,14,32,0.84),rgba(11,19,38,0.5)_48%,rgba(5,28,33,0.74))]" />
      <aside
        aria-label="Primary navigation"
        className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(88vw,320px)] flex-col border-r border-[var(--line)] bg-[var(--nav)] p-4 shadow-glass backdrop-blur-2xl transition-all duration-200 md:static md:translate-x-0 ${
          sidebarCollapsed ? "md:w-[84px] lg:w-[280px]" : "md:w-[280px] lg:w-[300px]"
        } ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line-bright)] bg-[var(--glass)] p-1.5 shadow-glow">
              <Image
                src="/sara-logo.png"
                alt="sarA AI logo"
                width={40}
                height={40}
                priority
                unoptimized
                className="h-full w-full object-contain"
              />
            </div>
            <div className={sidebarCollapsed ? "md:hidden lg:block" : ""}>
              <p className="text-lg font-semibold tracking-normal">sarA AI</p>
              <p className="text-xs text-[var(--muted)]">Personal assistant</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleNewChat}
          className="primary-action mt-6 flex min-h-12 w-full items-center justify-center gap-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          <span className={sidebarCollapsed ? "md:hidden lg:inline" : ""}>New chat</span>
        </button>

        <nav className="mt-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  setView(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
              >
                <Icon className="h-4 w-4" />
                <span className={sidebarCollapsed ? "md:hidden lg:inline" : ""}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("sara:open-install"))}
          className={`nav-item mt-3 ${sidebarCollapsed ? "md:hidden lg:flex" : ""}`}
        >
          <Download className="h-4 w-4" />
          <span>Install app</span>
        </button>

        <div className={`mt-6 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--field)] px-3 shadow-inner ${sidebarCollapsed ? "hidden lg:flex" : "flex"}`}>
          <Search className="h-4 w-4 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </div>

        <div className={`mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 ${sidebarCollapsed ? "hidden lg:block" : ""}`}>
          {filteredConversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`history-item group ${
                activeConversationId === conversation.id ? "history-item-active" : ""
              }`}
            >
              <button type="button" onClick={() => handleSelectConversation(conversation.id)} className="min-w-0 flex-1 text-left">
                <span className="line-clamp-1 text-sm font-medium">{conversation.title}</span>
                <span className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{conversation.last_message || "No messages yet"}</span>
              </button>
              <div className="mt-2 flex gap-1 opacity-60 transition group-hover:opacity-100">
                <button type="button" className="mini-action" onClick={() => handleRenameConversation(conversation)} aria-label="Rename conversation"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" className="mini-action text-[var(--rose)]" onClick={() => handleDeleteConversation(conversation)} aria-label="Delete conversation"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {!filteredConversations.length ? (
            loading ? (
              <div className="grid gap-2 py-2">
                {[0, 1, 2].map((item) => <div key={item} className="skeleton h-16 rounded-2xl" />)}
              </div>
            ) : <p className="px-2 py-6 text-sm text-[var(--muted)]">No chats yet</p>
          ) : null}
        </div>

        <div className={`mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 shadow-inner ${sidebarCollapsed ? "hidden lg:block" : ""}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.display_name}</p>
              <p className="truncate text-xs text-[var(--muted)]">{user.identifier}</p>
            </div>
            <button type="button" className="icon-button" onClick={handleLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          type="button"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <section className="app-main relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="app-header sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--nav)] px-3 shadow-glass backdrop-blur-2xl min-[390px]:px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="icon-button md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="hidden md:flex lg:hidden icon-button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!sidebarCollapsed}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm text-[var(--muted)]">
                {view === "chat" ? "Assistant workspace" : view === "dashboard" ? "Workspace overview" : view === "memory" ? "Personal context" : view === "history" ? "Chat history" : "Settings"}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-normal">
                {view === "chat" ? activeConversation?.title || "New chat" : view[0].toUpperCase() + view.slice(1)}
              </h1>
            </div>
          </div>

        </header>

        {error ? (
          <div className="error-banner mx-4 mt-4 rounded-2xl px-4 py-3 text-sm md:mx-6">
            {error}
          </div>
        ) : null}

        {view === "chat" ? (
          <ChatView
            messages={messages}
            sending={sending}
            streamingMessageId={streamingMessageId}
            draft={draft}
            setDraft={setDraft}
            onSend={handleSend}
            onStop={handleStop}
            bottomRef={bottomRef}
            onNewChat={handleNewChat}
          />
        ) : null}

        {view === "history" ? (
          <HistoryView
            conversations={filteredConversations}
            onSelect={handleSelectConversation}
            onNewChat={handleNewChat}
            onRename={handleRenameConversation}
            onDelete={handleDeleteConversation}
          />
        ) : null}

        {view === "dashboard" ? (
          <DashboardView conversations={conversations} activeBrain="Auto routed" />
        ) : null}

        {view === "memory" ? (
          <MemoryView user={user} conversations={conversations} messages={messages} />
        ) : null}

        {view === "settings" ? (
          <WorkspaceSettings
            user={user}
            theme={theme}
            setTheme={setTheme}
            status={brainStatus}
            onLogout={handleLogout}
          />
        ) : null}

        <button
          type="button"
          onClick={handleNewChat}
          className="floating-new-chat primary-action md:hidden"
          aria-label="Start new chat"
        >
          <Plus className="h-5 w-5" />
        </button>

        <nav aria-label="Mobile navigation" className={`mobile-nav grid grid-cols-5 border-t border-[var(--line)] bg-[var(--nav)] shadow-glass backdrop-blur-2xl md:hidden ${view === "chat" ? "hidden" : ""}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-xs ${
                  view === item.id ? "text-[var(--primary)]" : "text-[var(--muted)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </section>
    </main>
  );
}

type ChatViewProps = {
  messages: Message[];
  sending: boolean;
  streamingMessageId: string | null;
  draft: string;
  setDraft: (value: string) => void;
  onSend: (event?: FormEvent<HTMLFormElement>) => Promise<void>;
  onStop: () => void;
  bottomRef: RefObject<HTMLDivElement | null>;
  onNewChat: () => Promise<void>;
};

function ChatView({
  messages,
  sending,
  streamingMessageId,
  draft,
  setDraft,
  onSend,
  onStop,
  bottomRef,
  onNewChat,
}: ChatViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="chat-scroll mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 min-[390px]:px-4 md:px-6 md:py-6 2xl:max-w-5xl"
        role="log"
        aria-live="polite"
        aria-label="Conversation messages"
      >
        {!messages.length ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-xl text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--line-bright)] bg-[var(--glass)] shadow-glow backdrop-blur-2xl relative">
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    boxShadow: "0 0 30px rgba(99,102,241,0.28), 0 0 60px rgba(59,130,246,0.18)",
                    background: "radial-gradient(circle at 50% 30%, rgba(99,102,241,0.12), transparent 30%), radial-gradient(circle at 50% 70%, rgba(59,130,246,0.08), transparent 50%)",
                    WebkitMaskImage: "linear-gradient(#000, #000)",
                  }}
                />
                <Image
                  src="/sara-logo.png"
                  alt="sarA AI logo"
                  width={56}
                  height={56}
                  priority
                  unoptimized
                  className="relative h-7 w-7 object-contain"
                />
              </div>
              <h2 className="text-2xl font-semibold tracking-normal">Start with sarA</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Ask for a short answer, a decision, a draft, or the next best step.
              </p>
              <button
                type="button"
                onClick={onNewChat}
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--glass)] px-4 text-sm font-medium shadow-glass transition hover:border-[var(--primary)]"
              >
                <Plus className="h-4 w-4" />
                New chat
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              streaming={message.id === streamingMessageId}
            />
          ))
        )}

        {sending && !messages.some((message) => message.id === streamingMessageId && message.content) ? (
          <div className="flex justify-start">
            <div className="message-bubble-ai flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--primary)]" />
              <span className="typing-dot" />
              <span className="typing-dot animation-delay-150" />
              <span className="typing-dot animation-delay-300" />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={onSend}
        className="chat-composer border-t border-[var(--line)] bg-[var(--nav)] px-2 py-2 shadow-glass backdrop-blur-2xl min-[390px]:px-3 md:px-6 md:py-3"
      >
        <div className="chat-input-shell mx-auto flex w-full max-w-4xl items-end gap-2 rounded-[1.35rem] border border-[var(--line)] bg-[var(--field)] p-1.5 min-[390px]:gap-3 min-[390px]:rounded-3xl min-[390px]:p-2 2xl:max-w-5xl">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onSend();
              }
            }}
            rows={1}
            placeholder="Message sarA"
            aria-label="Message sarA"
            className="max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-[var(--muted)] md:px-3 md:text-sm"
          />
          {sending ? (
            <button
              type="button"
              onClick={onStop}
              className="primary-action flex h-10 w-10 shrink-0 items-center justify-center text-white"
              aria-label="Stop response"
              title="Stop response"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="primary-action flex h-10 w-10 shrink-0 items-center justify-center text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message, streaming = false }: { message: Message; streaming?: boolean }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className={`flex animate-message-in ${isUser ? "justify-end" : "justify-start"}`}>
      <article className={isUser ? "message-bubble-user" : "message-bubble-ai"}>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
          {isUser ? (
            <>
              <Check className="h-3.5 w-3.5" />
              You
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              sarA
            </>
          )}
          <span>{formatTime(message.created_at)}</span>
        </div>
        <MessageContent content={message.content} />
        {!isUser && !streaming && message.content ? (
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 flex items-center gap-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--primary)]"
            aria-label="Copy response"
            title="Copy response"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </article>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts = parseMarkdownCodeBlocks(content);

  return (
    <div className="message-content">
      {parts.map((part, index) =>
        part.type === "code" ? (
          <CodeBlock
            key={`${part.type}-${index}`}
            code={part.content}
            language={part.language}
          />
        ) : (
          <TextBlock key={`${part.type}-${index}`} content={part.content} />
        ),
      )}
    </div>
  );
}

function TextBlock({ content }: { content: string }) {
  if (!content) return null;
  const lines = content.split("\n");
  return (
    <div className="markdown-text">
      {lines.map((line, index) => {
        if (!line.trim()) return <div key={index} className="h-2" />;
        if (isTableLine(line)) {
          if (index > 0 && isTableLine(lines[index - 1])) return null;
          return <MarkdownTable key={index} rows={collectTableRows(lines, index)} />;
        }
        if (line.startsWith("### ")) return <h4 key={index}>{renderInline(line.slice(4))}</h4>;
        if (line.startsWith("## ")) return <h3 key={index}>{renderInline(line.slice(3))}</h3>;
        if (line.startsWith("# ")) return <h2 key={index}>{renderInline(line.slice(2))}</h2>;
        if (/^[-*] /.test(line)) return <div key={index} className="markdown-list-item"><span />{renderInline(line.slice(2))}</div>;
        if (/^\d+\. /.test(line)) return <div key={index} className="markdown-list-item numbered">{renderInline(line)}</div>;
        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function isTableLine(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function collectTableRows(lines: string[], start: number) {
  const rows: string[] = [];
  for (let index = start; index < lines.length && isTableLine(lines[index]); index += 1) {
    rows.push(lines[index]);
  }
  return rows;
}

function MarkdownTable({ rows }: { rows: string[] }) {
  const parsed = rows
    .map((row) => row.trim().slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)));
  if (!parsed.length) return null;
  return (
    <div className="markdown-table-wrap">
      <table>
        <thead><tr>{parsed[0].map((cell, index) => <th key={index}>{renderInline(cell)}</th>)}</tr></thead>
        <tbody>{parsed.slice(1).map((cells, rowIndex) => <tr key={rowIndex}>{cells.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function renderInline(content: string) {
  return content.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const label = language || "code";

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{label}</span>
        <button
          type="button"
          className="code-copy-button"
          onClick={handleCopy}
          aria-label="Copy code"
          title="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className={`syntax language-${label.toLowerCase()}`}>
        <code>{highlightCode(code)}</code>
      </pre>
    </div>
  );
}

type MarkdownPart =
  | { type: "text"; content: string }
  | { type: "code"; content: string; language: string };

function parseMarkdownCodeBlocks(content: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const blockPattern = /```([\w.+#-]*)\s*\n?([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(content)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: "text", content: content.slice(cursor, match.index) });
    }
    parts.push({
      type: "code",
      language: normalizeLanguage(match[1]),
      content: match[2].replace(/\s+$/, ""),
    });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) {
    parts.push({ type: "text", content: content.slice(cursor) });
  }

  return parts.length ? parts : [{ type: "text", content }];
}

function normalizeLanguage(language: string) {
  const clean = language.trim().toLowerCase();
  const aliases: Record<string, string> = {
    js: "javascript",
    jsx: "react",
    ts: "typescript",
    tsx: "react",
    py: "python",
    html: "html",
    css: "css",
  };
  return aliases[clean] || clean;
}

const TOKEN_PATTERN =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:async|await|break|case|class|const|def|delete|else|except|export|extends|false|finally|for|from|function|if|import|in|interface|let|new|null|return|select|then|true|try|type|update|where|while|yield)\b|\b\d+(?:\.\d+)?\b)/g;

function highlightCode(code: string) {
  return code.split(TOKEN_PATTERN).map((part, index) => {
    if (!part) return null;
    let className = "";
    if (/^(\/\/|#|\/\*)/.test(part)) className = "token-comment";
    else if (/^["'`]/.test(part)) className = "token-string";
    else if (/^\d/.test(part)) className = "token-number";
    else if (/^[a-z_]+$/i.test(part)) className = "token-keyword";

    return className ? (
      <span key={`${part}-${index}`} className={className}>
        {part}
      </span>
    ) : (
      part
    );
  });
}

function HistoryView({
  conversations,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
}: {
  conversations: Conversation[];
  onSelect: (conversationId: string) => Promise<void>;
  onNewChat: () => Promise<void>;
  onRename: (conversation: Conversation) => Promise<void>;
  onDelete: (conversation: Conversation) => Promise<void>;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6 md:px-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-normal">Chat history</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{conversations.length} saved chats</p>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="primary-action flex h-10 items-center gap-2 px-4 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {conversations.map((conversation) => (
          <article key={conversation.id} className="content-card transition hover:border-[var(--primary)]">
            <button type="button" onClick={() => onSelect(conversation.id)} className="block w-full text-left">
              <p className="line-clamp-1 font-medium">{conversation.title}</p>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[var(--muted)]">{conversation.last_message || "No messages yet"}</p>
              <p className="mt-4 text-xs text-[var(--muted)]">Updated {new Date(`${conversation.updated_at}Z`).toLocaleDateString()}</p>
            </button>
            <div className="mt-4 flex gap-2 border-t border-[var(--line)] pt-3">
              <button type="button" className="secondary-button" onClick={() => onRename(conversation)}><Pencil className="h-3.5 w-3.5" />Rename</button>
              <button type="button" className="secondary-button text-[var(--rose)]" onClick={() => onDelete(conversation)}><Trash2 className="h-3.5 w-3.5" />Delete</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SettingsView({
  user,
  theme,
  setTheme,
  conversations,
  onLogout,
}: {
  user: User;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  conversations: Conversation[];
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6 md:px-6">
      <h2 className="text-2xl font-semibold tracking-normal">Settings</h2>

      <section className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-sm font-medium text-[var(--muted)]">Profile</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.display_name}</p>
            <p className="truncate text-sm text-[var(--muted)]">{user.identifier}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-sm font-medium text-[var(--muted)]">Appearance</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`setting-choice ${theme === "dark" ? "setting-choice-active" : ""}`}
          >
            <Moon className="h-4 w-4" />
            Dark
          </button>
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`setting-choice ${theme === "light" ? "setting-choice-active" : ""}`}
          >
            <Sun className="h-4 w-4" />
            Light
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <p className="text-sm font-medium text-[var(--muted)]">Memory</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
            <p className="text-2xl font-semibold">{conversations.length}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Saved chats</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-4">
            <p className="text-2xl font-semibold">Private</p>
            <p className="mt-1 text-sm text-[var(--muted)]">User scope</p>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onLogout}
        className="mt-5 flex h-11 items-center gap-2 rounded-2xl border border-[var(--line)] px-4 text-sm font-medium text-[var(--rose)] transition hover:border-[var(--rose)]"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>
    </div>
  );
}
