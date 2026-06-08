const API_URL = "https://sara-ai-wf20.onrender.com";

/**
 * Generic API helper (ONLY ONE YOU NEED)
 */
export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {}

    throw new Error(errorData?.detail || "API request failed");
  }

  return res.json();
}
