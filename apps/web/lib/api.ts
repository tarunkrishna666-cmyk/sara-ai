const API_URL = "https://sara-ai-wf20.onrender.com";

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
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.detail || "API request failed");
  }

  return res.json();
}

/* OPTIONAL SAFE HELPERS (used by admin) */

export async function getCurrentUser() {
  return apiFetch("/api/auth/me");
}

export async function adminRequest(path: string, options?: RequestInit) {
  return fetch(`${API_URL}/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail || "Admin request failed");
    }
    return res.json();
  });
}

export async function logout() {
  return fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export function clearAccessToken() {
  sessionStorage.removeItem("sara:access-token");
}
