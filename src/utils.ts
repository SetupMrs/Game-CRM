import { TEAM_MEMBER_COLORS } from "./types";

/**
 * Generates a reasonably unique id. Uses crypto.randomUUID when available
 * (all modern browsers), falling back to timestamp + random suffix so two
 * ids created in the same millisecond never collide.
 */
export function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${randomPart}`;
}

/**
 * Formats a date string (ISO or YYYY-MM-DD) to Ukrainian standard: DD.MM.YYYY
 */
export function formatDate(dateString?: string): string {
  if (!dateString) return "-";
  try {
    // If it has a T, grab the date part
    const cleanDate = dateString.includes("T") ? dateString.split("T")[0] : dateString;
    const parts = cleanDate.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${day}.${month}.${year}`;
    }
    
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return dateString;
    }
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return dateString;
  }
}

/**
 * Formats an ISO timestamp as a short relative time in Ukrainian
 * (e.g. "щойно", "5 хв тому", "3 год тому", "2 дні тому").
 * Falls back to formatDate for anything older than ~a week.
 */
export function formatRelativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  if (isNaN(then)) return isoString;
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 10) return "щойно";
  if (diffSec < 60) return `${diffSec} с тому`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} хв тому`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} год тому`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? "день" : "дні"} тому`;
  return formatDate(isoString);
}

/**
 * Deterministically picks an avatar color for a user id/username from
 * TEAM_MEMBER_COLORS — same input always maps to the same color, so a
 * person's avatar color stays consistent across the app without needing to
 * be stored anywhere.
 */
export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TEAM_MEMBER_COLORS[hash % TEAM_MEMBER_COLORS.length];
}
