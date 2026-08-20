import { sanitizeText, sanitizeUrl } from "./utils.js";

export function validateLinkForm(form) {
  const rawUrl = sanitizeText(form.get("url"));
  const url = sanitizeUrl(rawUrl);
  const title = sanitizeText(form.get("title"));
  const tag = sanitizeText(form.get("tag"));
  const errors = [];

  if (!url) errors.push("URL is required and must be https://");
  if (!title) errors.push("Title is required");
  if (title.length > 200) errors.push("Title must be 200 characters or fewer");
  if (tag.length > 50) errors.push("Tag must be 50 characters or fewer");

  // `data.url` carries the sanitized https:// URL for insertion. `rawUrl` is
  // returned separately so an invalid submission can be redisplayed as typed
  // (escaped on output, not re-validated) instead of silently blanked.
  return {
    valid: errors.length === 0,
    errors,
    data: { url: url || "", title, tag, rawUrl },
  };
}
