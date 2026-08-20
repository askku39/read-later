const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function sanitizeUrl(str) {
  if (!str || typeof str !== "string") return null;
  const trimmed = str.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {}
  return null;
}

export const safeUrl = sanitizeUrl;

export function sanitizeText(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}
