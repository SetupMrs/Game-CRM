// Centralized fetch wrapper: attaches the auth token and surfaces 401s to
// the app via an event so a login screen can be shown, instead of every
// component doing this itself.

export type UserRole = "admin" | "support";

export interface AppUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt?: string;
}

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

// Checks whether the stored token (if any) is still a valid session, and
// returns the logged-in user. The app always requires a real account now —
// there is no "open" mode.
export async function fetchCurrentUser(): Promise<AppUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setToken(null);
      return null;
    }
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<{ success: boolean; message?: string; user?: AppUser }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.message || "Невірний логін або пароль." };
    }
    if (data.token) {
      setToken(data.token);
    }
    return { success: true, user: data.user };
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

// --- User management (admin only) -----------------------------------------

export async function listUsers(): Promise<{ success: boolean; users?: AppUser[]; message?: string }> {
  try {
    const res = await apiFetch("/api/users");
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message };
    return { success: true, users: data.users };
  } catch {
    return { success: false, message: "Не вдалося з'єднатися із сервером." };
  }
}

export async function createUser(username: string, password: string, role: UserRole): Promise<{ success: boolean; user?: AppUser; message?: string }> {
  try {
    const res = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message };
    return { success: true, user: data.user };
  } catch {
    return { success: false, message: "Не вдалося з'єднатися із сервером." };
  }
}

export async function resetUserPassword(id: string, password: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch(`/api/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message };
    return { success: true };
  } catch {
    return { success: false, message: "Не вдалося з'єднатися із сервером." };
  }
}

export async function deleteUser(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return { success: false, message: data.message };
    return { success: true };
  } catch {
    return { success: false, message: "Не вдалося з'єднатися із сервером." };
  }
}

// Generates a strong random password client-side, using the Web Crypto API
// (not Math.random) so it's suitable to hand to a new user.
export function generateRandomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
