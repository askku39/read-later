const COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

function toBase64Url(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function signingKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(value, secret) {
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export function adminEnabled(env) {
  return typeof env.ADMIN_TOKEN === "string" && env.ADMIN_TOKEN.length >= 32;
}

// Compares two strings without leaking their contents through timing. Both
// sides are HMAC'd under a key that is random per call, so the digests an
// attacker can influence are unpredictable and always 32 bytes — the byte
// loop below therefore runs in constant time regardless of input length.
export async function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i += 1) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

// Fixed-window login throttle.
//
// Limitation: this Map lives in one Worker isolate, not globally. Cloudflare
// runs many isolates across many colos, so a distributed attacker gets more
// than LOGIN_MAX_FAILURES attempts overall. Acceptable for a single-admin
// site whose token is >= 32 chars; do NOT add KV or Durable Objects for this.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_TRACKER_MAX = 1000;
const loginFailures = new Map();

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export function loginBlocked(ip, now = Date.now()) {
  const entry = loginFailures.get(ip);
  if (!entry) return false;
  if (now - entry.windowStart >= LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

export function loginRetryAfterSeconds(ip, now = Date.now()) {
  const entry = loginFailures.get(ip);
  if (!entry) return 0;
  return Math.max(1, Math.ceil((entry.windowStart + LOGIN_WINDOW_MS - now) / 1000));
}

export function recordLoginFailure(ip, now = Date.now()) {
  const entry = loginFailures.get(ip);
  if (entry && now - entry.windowStart < LOGIN_WINDOW_MS) {
    entry.count += 1;
    return;
  }
  if (!entry && loginFailures.size >= LOGIN_TRACKER_MAX) {
    // Drop entries whose window has already lapsed. Anything still here is an
    // active failure window, so refuse the new entry rather than clearing live
    // counters — clearing would let an IP flood reset its own block.
    for (const [key, tracked] of loginFailures) {
      if (now - tracked.windowStart >= LOGIN_WINDOW_MS) loginFailures.delete(key);
    }
    if (loginFailures.size >= LOGIN_TRACKER_MAX) return;
  }
  loginFailures.set(ip, { count: 1, windowStart: now });
}

export function clearLoginFailures(ip) {
  loginFailures.delete(ip);
}

export async function createAdminSession(secret) {
  const payload = JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    csrf: toBase64Url(crypto.getRandomValues(new Uint8Array(32))),
  });
  const encodedPayload = toBase64Url(encoder.encode(payload));
  return `${encodedPayload}.${await sign(encodedPayload, secret)}`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function verifyAdminSession(request, secret) {
  const cookie = getCookie(request, COOKIE_NAME);
  if (!cookie) return null;
  const [encodedPayload, providedSignature] = cookie.split(".");
  if (!encodedPayload || !providedSignature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      fromBase64Url(providedSignature),
      encoder.encode(encodedPayload)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload)));
    if (!payload || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.csrf !== "string" || payload.csrf.length < 40) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(session) {
  return `${COOKIE_NAME}=${session}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`;
}

export function adminLoginPage(error = "") {
  const errorHtml = error ? `<p class="form-errors">${error}</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin login</title><link rel="stylesheet" href="/style.css"></head>
<body><main class="main-content"><section class="section"><div class="container narrow">
<h1>Admin login</h1>${errorHtml}
<form method="POST" action="/admin/login" class="form">
<label>Admin token<input type="password" name="token" required autocomplete="current-password"></label>
<button type="submit" class="btn">Log in</button>
</form></div></section></main></body></html>`;
}

export async function handleAdminLogin(env, request) {
  if (request.method === "GET") {
    return new Response(adminLoginPage(), { headers: { "content-type": "text/html; charset=UTF-8" } });
  }

  const ip = clientIp(request);
  // Throttle before reading the body: a blocked client should cost nothing.
  // This path deliberately does not record a failure, so hammering while
  // blocked cannot extend the window past its original 15 minutes.
  if (loginBlocked(ip)) {
    return new Response(adminLoginPage("Too many attempts, try again later"), {
      status: 429,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "Retry-After": String(loginRetryAfterSeconds(ip)),
      },
    });
  }

  const form = await request.formData();
  const token = form.get("token");
  if (typeof token !== "string" || !(await timingSafeEqual(token, env.ADMIN_TOKEN))) {
    recordLoginFailure(ip);
    console.warn(`admin login failed ip=${ip} at=${new Date().toISOString()}`);
    return new Response(adminLoginPage("Incorrect admin token"), {
      status: 401,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  }

  clearLoginFailures(ip);
  const session = await createAdminSession(env.ADMIN_TOKEN);
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/", "Set-Cookie": sessionCookie(session) },
  });
}

export function originMatchesSite(request, siteUrl) {
  const supplied = request.headers.get("Origin") || request.headers.get("Referer");
  if (!supplied) return false;
  try {
    return new URL(supplied).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}

export async function verifyAdminPost(request, session, siteUrl) {
  if (!originMatchesSite(request, siteUrl)) return false;
  const form = await request.clone().formData();
  return form.get("csrf") === session.csrf;
}

export function adminDisabledResponse() {
  return new Response("admin disabled", { status: 503 });
}

export function unauthorizedResponse() {
  return new Response("unauthorized", { status: 401 });
}

export function csrfForbiddenResponse() {
  return new Response("forbidden", { status: 403 });
}
