function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. HTTP on mobile)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateGuestSessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "tipsycake_guest_session_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `guest_${generateId()}`;
  window.localStorage.setItem(key, created);
  return created;
}
