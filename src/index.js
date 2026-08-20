import { buildIndexPage } from "./templates/links.js";
import { buildAdminPage, handleLinksCreate, handleLinksDelete } from "./templates/admin.js";
import {
  adminDisabledResponse,
  adminEnabled,
  clearSessionCookie,
  csrfForbiddenResponse,
  handleAdminLogin,
  unauthorizedResponse,
  verifyAdminPost,
  verifyAdminSession,
} from "./adminAuth.js";
import { getSiteUrl } from "./config.js";

const HTML_HEADERS = { "content-type": "text/html; charset=UTF-8" };

// No Turnstile/captcha here — there's no public write path to protect (all
// writes require an authenticated admin session), so no connect-src/frame-src
// exception is needed. No 'unsafe-inline' on style-src either — none of the
// templates render an inline <style> attribute or tag.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "style-src 'self'",
  "script-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};

// Applied to HTML responses only. Static assets are served ahead of the
// Worker by the assets binding and never reach this.
function withSecurityHeaders(response) {
  if (!(response.headers.get("content-type") || "").startsWith("text/html")) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function notFound() {
  return new Response("not found", { status: 404, headers: HTML_HEADERS });
}

function methodNotAllowed(allow) {
  return new Response("method not allowed", { status: 405, headers: { Allow: allow } });
}

export default {
  async fetch(request, env) {
    if (request.method === "HEAD") {
      const response = withSecurityHeaders(await route(asGet(request), env));
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    return withSecurityHeaders(await route(request, env));
  },
};

function asGet(request) {
  return new Request(request.url, { method: "GET", headers: request.headers });
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  let adminSession = null;

  if (path === "/admin/login" || path === "/admin" || path.startsWith("/admin/")) {
    if (!adminEnabled(env)) return adminDisabledResponse();

    if (path === "/admin/login") {
      if (request.method === "GET" || request.method === "POST") return handleAdminLogin(env, request);
      return new Response("method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
    }

    adminSession = await verifyAdminSession(request, env.ADMIN_TOKEN);
    if (!adminSession) {
      if (request.method === "GET") return new Response(null, { status: 302, headers: { Location: "/admin/login" } });
      return unauthorizedResponse();
    }

    if (request.method === "POST" && !(await verifyAdminPost(request, adminSession, getSiteUrl(env)))) {
      return csrfForbiddenResponse();
    }

    if (path === "/admin/logout") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return new Response(null, {
        status: 303,
        headers: { Location: "/admin/login", "Set-Cookie": clearSessionCookie() },
      });
    }

    if (path === "/admin" || path === "/admin/") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return new Response(await buildAdminPage(env, { csrfToken: adminSession.csrf }), { headers: HTML_HEADERS });
    }

    if (path === "/admin/api/links/create") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleLinksCreate(env, request, adminSession);
    }

    if (path === "/admin/api/links/delete") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      return handleLinksDelete(env, request);
    }

    return notFound();
  }

  if (path === "/") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return new Response(await buildIndexPage(env), { headers: HTML_HEADERS });
  }

  return notFound();
}
