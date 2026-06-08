import type { AuthResponse, BrainStatus, ChatResponse, ChatStreamReady, Conversation, Message, User } from "./types";

const API_URL = "https://sara-ai-wf20.onrender.com";
const SESSION_TOKEN = "sara:access-token";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Cannot connect to the sarA API at ${API_URL}. Start the backend and try again.`);
    }
    throw error;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(typeof window !== "undefined" && sessionStorage.getItem(SESSION_TOKEN)
        ? { Authorization: `Bearer ${sessionStorage.getItem(SESSION_TOKEN)}` }
        : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.message || body.error || "Request failed");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function accountExists(email: string): Promise<{ exists: boolean }> {
  return request<{ exists: boolean }>("/api/auth/account", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser(): Promise<User> {
  return request<User>("/api/auth/me");
}

export function storeAccessToken(token?: string | null) {
  if (token) sessionStorage.setItem(SESSION_TOKEN, token);
}

export function clearAccessToken() {
  sessionStorage.removeItem(SESSION_TOKEN);
}

export function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(`/api/admin${path}`, init);
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function getConversations(userId: string): Promise<Conversation[]> {
  return requestWithDeviceCache<Conversation[]>(
    `/api/users/${userId}/conversations`,
    `sara:conversations:${userId}`,
  );
}

export function createConversation(userId: string): Promise<Conversation> {
  return request<Conversation>(`/api/users/${userId}/conversations`, {
    method: "POST",
    body: JSON.stringify({ title: "New chat" }),
  });
}

export function getMessages(conversationId: string, userId: string): Promise<Message[]> {
  return requestWithDeviceCache<Message[]>(
    `/api/conversations/${conversationId}/messages?user_id=${encodeURIComponent(userId)}`,
    `sara:messages:${userId}:${conversationId}`,
  );
}

async function requestWithDeviceCache<T>(path: string, cacheKey: string): Promise<T> {
  try {
    const data = await request<T>(path);
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch (error) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as T;
    throw error;
  }
}

export function renameConversation(
  conversationId: string,
  userId: string,
  title: string,
): Promise<Conversation> {
  return request<Conversation>(
    `/api/conversations/${conversationId}?user_id=${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
}

export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  await request<void>(
    `/api/conversations/${conversationId}?user_id=${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export function getBrainStatus(): Promise<BrainStatus> {
  return request<BrainStatus>("/api/status");
}

export function sendChatMessage(
  userId: string,
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      userId,
      message,
      conversationId,
    }),
  });
}

type StreamHandlers = {
  onReady?: (payload: ChatStreamReady) => void;
  onToken?: (content: string) => void;
  onFinal?: (payload: ChatResponse) => void;
};

export async function streamChatMessage(
  userId: string,
  message: string,
  conversationId: string | undefined,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const response = await apiFetch("/api/chat/stream", {
    method: "POST",
    credentials: "include",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(sessionStorage.getItem(SESSION_TOKEN)
        ? { Authorization: `Bearer ${sessionStorage.getItem(SESSION_TOKEN)}` }
        : {}),
    },
    body: JSON.stringify({
      userId,
      message,
      conversationId,
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.message || body.error || "Request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: ChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      if (!rawEvent.trim()) continue;
      const event = parseStreamEvent(rawEvent);
      if (!event) continue;

      if (event.name === "ready") {
        handlers.onReady?.(event.data as ChatStreamReady);
      } else if (event.name === "token") {
        const token = (event.data as { content?: unknown }).content;
        if (typeof token === "string") handlers.onToken?.(token);
      } else if (event.name === "final") {
        finalPayload = event.data as ChatResponse;
        handlers.onFinal?.(finalPayload);
      } else if (event.name === "error") {
        const detail = (event.data as { detail?: unknown }).detail;
        throw new Error(typeof detail === "string" ? detail : "sarA could not reply");
      }
    }

    if (done) break;
  }

  if (!finalPayload) {
    throw new Error("sarA response ended before it was saved");
  }

  return finalPayload;
}

function parseStreamEvent(rawEvent: string): { name: string; data: unknown } | null {
  let name = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      name = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (!dataLines.length) return null;
  return {
    name,
    data: JSON.parse(dataLines.join("\n")),
  };
}
