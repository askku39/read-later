const DEFAULT_SITE_URL = "http://localhost:8787";
export const SITE_NAME = "Read Later";

export function getSiteUrl(env) {
  return typeof env?.SITE_URL === "string" && env.SITE_URL.trim()
    ? env.SITE_URL.trim().replace(/\/$/, "")
    : DEFAULT_SITE_URL;
}
