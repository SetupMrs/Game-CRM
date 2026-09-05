// Centralized fetch wrapper: attaches the auth token (when the server has
// APP_PASSWORD configured) and surfaces 401s to the app via an event so a
// login screen can be shown, instead of every component doing this itself.

const TOKEN_KEY = "game_crm_auth_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors (e.g. private browsing with storage disabled).
  }
}

export const AUTH_REQUIRED_EVENT = "game-crm:auth-required";

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT));
  }

  return res;
}

export async function checkAuthStatus(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/status");
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.authRequired;
  } catch {
    return false;
  }
}

export async function login(password: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.message || "Невірний пароль." };
    }
    if (data.token) {
      setToken(data.token);
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: "Не вдалося з'єднатися із сервером." };
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // best-effort
  } finally {
    setToken(null);
  }
}
