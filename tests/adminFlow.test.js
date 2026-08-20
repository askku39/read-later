import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import {
  clearLoginFailures,
  loginBlocked,
  recordLoginFailure,
  verifyAdminPost,
} from "../src/adminAuth.js";

const SITE = "https://example.test";
const TOKEN = "t".repeat(32);

// Minimal D1 stand-in: dispatches on the SQL the routes actually issue and
// mutates an in-memory row array, so the write flows can be asserted end to end.
function fakeDb(rows) {
  let nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
  return {
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) {
          statement.args = args;
          return statement;
        },
        async all() {
          if (sql.includes("SELECT * FROM links")) {
            return { results: [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.startsWith("INSERT INTO links")) {
            const [url, title, tag] = statement.args;
            rows.push({ id: nextId++, url, title, tag, created_at: new Date().toISOString() });
          } else if (sql.startsWith("DELETE FROM links")) {
            const [id] = statement.args;
            const idx = rows.findIndex((r) => String(r.id) === String(id));
            if (idx !== -1) rows.splice(idx, 1);
          }
          return { success: true };
        },
      };
      return statement;
    },
  };
}

function seedRows() {
  return [{ id: 1, url: "https://example.com/a", title: "first link", tag: "misc", created_at: "2026-01-01T00:00:00Z" }];
}

async function login(env, ip) {
  const res = await worker.fetch(
    new Request(`${SITE}/admin/login`, {
      method: "POST",
      headers: { "CF-Connecting-IP": ip, "content-type": "application/x-www-form-urlencoded" },
      body: `token=${TOKEN}`,
    }),
    env
  );
  assert.equal(res.status, 303);
  const cookie = res.headers.get("Set-Cookie").split(";", 1)[0];
  const page = await worker.fetch(new Request(`${SITE}/admin/`, { headers: { Cookie: cookie } }), env);
  const html = await page.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  return { cookie, csrf };
}

function adminPost(path, cookie, csrf, fields, env) {
  const body = new URLSearchParams({ ...fields, csrf });
  return new Request(`${SITE}${path}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: SITE,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

test("authenticated admin can save a link", async () => {
  const rows = seedRows();
  const env = { DB: fakeDb(rows), ADMIN_TOKEN: TOKEN, SITE_URL: SITE };
  const { cookie, csrf } = await login(env, "10.0.0.1");

  const res = await worker.fetch(
    adminPost("/admin/api/links/create", cookie, csrf, { url: "https://example.com/b", title: "new link", tag: "read" }, env),
    env
  );
  assert.equal(res.status, 303);
  assert.ok(rows.some((r) => r.title === "new link"));
});

test("create rejects a non-https URL", async () => {
  const rows = seedRows();
  const env = { DB: fakeDb(rows), ADMIN_TOKEN: TOKEN, SITE_URL: SITE };
  const { cookie, csrf } = await login(env, "10.0.0.7");

  const res = await worker.fetch(
    adminPost("/admin/api/links/create", cookie, csrf, { url: "javascript:alert(1)", title: "bad" }, env),
    env
  );
  assert.equal(res.status, 400);
  assert.equal(rows.length, 1);
});

test("create rejects a blank title", async () => {
  const rows = seedRows();
  const env = { DB: fakeDb(rows), ADMIN_TOKEN: TOKEN, SITE_URL: SITE };
  const { cookie, csrf } = await login(env, "10.0.0.8");

  const res = await worker.fetch(
    adminPost("/admin/api/links/create", cookie, csrf, { url: "https://example.com/c", title: "" }, env),
    env
  );
  assert.equal(res.status, 400);
  assert.equal(rows.length, 1);
});

test("authenticated admin can delete a link", async () => {
  const rows = seedRows();
  const env = { DB: fakeDb(rows), ADMIN_TOKEN: TOKEN, SITE_URL: SITE };
  const { cookie, csrf } = await login(env, "10.0.0.2");

  const res = await worker.fetch(
    adminPost("/admin/api/links/delete", cookie, csrf, { id: "1" }, env),
    env
  );
  assert.equal(res.status, 303);
  assert.equal(rows.length, 0);
});

// verifyAdminPost reads request.clone().formData(), then the route handler
// reads request.formData() on the original. If the clone consumed the body
// instead of copying it, the second read would come back empty.
test("request body survives the CSRF clone read", async () => {
  const session = { csrf: "token-value" };
  const request = new Request(`${SITE}/admin/api/links/create`, {
    method: "POST",
    headers: { Origin: SITE, "content-type": "application/x-www-form-urlencoded" },
    body: "title=x&csrf=token-value",
  });

  assert.equal(await verifyAdminPost(request, session, SITE), true);
  const form = await request.formData();
  assert.equal(form.get("title"), "x");
});

test("wrong origin fails CSRF check", async () => {
  const session = { csrf: "token-value" };
  const request = new Request(`${SITE}/admin/api/links/create`, {
    method: "POST",
    headers: { Origin: "https://evil.test", "content-type": "application/x-www-form-urlencoded" },
    body: "title=x&csrf=token-value",
  });
  assert.equal(await verifyAdminPost(request, session, SITE), false);
});

test("unauthenticated POST is rejected", async () => {
  const env = { DB: fakeDb(seedRows()), ADMIN_TOKEN: TOKEN, SITE_URL: SITE };
  const res = await worker.fetch(
    new Request(`${SITE}/admin/api/links/create`, { method: "POST", body: "title=x" }),
    env
  );
  assert.equal(res.status, 401);
});

// A successful login must reset the failure counter, or a legitimate login
// after 4 wrong guesses would count toward the next window's limit.
test("a successful login resets the failure counter", async () => {
  const env = { DB: fakeDb(seedRows()), ADMIN_TOKEN: TOKEN, SITE_URL: SITE };
  const ip = "10.0.0.6";
  clearLoginFailures(ip);

  const attempt = (token) =>
    worker.fetch(
      new Request(`${SITE}/admin/login`, {
        method: "POST",
        headers: { "CF-Connecting-IP": ip, "content-type": "application/x-www-form-urlencoded" },
        body: `token=${token}`,
      }),
      env
    );

  for (let i = 0; i < 4; i += 1) assert.equal((await attempt("wrong")).status, 401);
  assert.equal((await attempt(TOKEN)).status, 303);

  for (let i = 0; i < 5; i += 1) assert.equal((await attempt("wrong")).status, 401);
  assert.equal((await attempt("wrong")).status, 429);
});

test("login failure window expires", () => {
  const ip = "10.0.0.5";
  clearLoginFailures(ip);
  const start = Date.now();
  for (let i = 0; i < 5; i += 1) recordLoginFailure(ip, start);
  assert.equal(loginBlocked(ip, start), true);
  assert.equal(loginBlocked(ip, start + 16 * 60 * 1000), false);
});
