import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { createAdminSession, sessionCookie } from "../src/adminAuth.js";
import { sanitizeUrl } from "../src/utils.js";

const DB = {
  prepare() {
    return {
      bind() {
        return this;
      },
      all: async () => ({ results: [] }),
      first: async () => null,
    };
  },
};

test("sanitizeUrl accepts HTTPS and rejects unsafe schemes", () => {
  assert.equal(sanitizeUrl("https://example.com")?.startsWith("https://"), true);
  assert.equal(sanitizeUrl("http://example.com"), null);
  assert.equal(sanitizeUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeUrl("data:text/html,x"), null);
});

test("admin authentication and CSRF gates fail closed", async () => {
  const missing = await worker.fetch(new Request("https://example.test/admin"), { DB });
  assert.equal(missing.status, 503);

  const env = { DB, ADMIN_TOKEN: "x".repeat(32) };
  const get = await worker.fetch(new Request("https://example.test/admin"), env);
  assert.equal(get.status, 302);
  const post = await worker.fetch(
    new Request("https://example.test/admin/api/items/create", { method: "POST" }),
    env
  );
  assert.equal(post.status, 401);

  const session = await createAdminSession(env.ADMIN_TOKEN);
  const cookie = sessionCookie(session).split(";", 1)[0];
  const csrf = await worker.fetch(
    new Request("https://example.test/admin/api/items/create", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://example.test", "content-type": "application/x-www-form-urlencoded" },
      body: "title=test",
    }),
    env
  );
  assert.equal(csrf.status, 403);
});

test("routes return 405/404 correctly", async () => {
  assert.equal((await worker.fetch(new Request("https://example.test/", { method: "POST" }), { DB })).status, 405);
  assert.equal((await worker.fetch(new Request("https://example.test/nonexistent"), { DB })).status, 404);
});

test("HEAD is served wherever GET is", async () => {
  const env = { DB };
  const res = await worker.fetch(new Request("https://example.test/", { method: "HEAD" }), env);
  assert.equal(res.status, 200);
});

test("security headers are present on HTML responses", async () => {
  const env = { DB };
  const res = await worker.fetch(new Request("https://example.test/"), env);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  const csp = res.headers.get("Content-Security-Policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
});

test("no inline event handlers are rendered", async () => {
  const env = { DB };
  const res = await worker.fetch(new Request("https://example.test/"), env);
  const html = await res.text();
  assert.doesNotMatch(html, /\son[a-z]+=/i, "/ must not contain inline handlers");
});
