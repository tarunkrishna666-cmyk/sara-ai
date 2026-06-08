const API_URL = "https://sara-ai-wf20.onrender.com";

/**
 * IMPORTANT:
 * apiFetch should ONLY join base URL once.
 */
async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, init);
}

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

/**
 * SSE parser (unchanged but safe)
 */
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

  try {
    return {
      name,
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}
