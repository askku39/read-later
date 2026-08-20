import { SITE_NAME } from "../config.js";
import { escapeHtml } from "../utils.js";
import { listLinks, insertLink, deleteLink } from "../db.js";
import { validateLinkForm } from "../validate.js";
import { pageShell } from "./shell.js";

function actionForm(action, id, label, csrfToken) {
  return `<form method="POST" action="/admin/api/links/${action}" class="admin-action">
    <input type="hidden" name="id" value="${escapeHtml(id)}">
    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
    <button type="submit">${label}</button>
  </form>`;
}

function linkRow(link, csrfToken) {
  return `
<tr>
  <td><a href="${escapeHtml(link.url)}" rel="noopener noreferrer">${escapeHtml(link.title)}</a></td>
  <td>${escapeHtml(link.tag || "")}</td>
  <td>${escapeHtml(link.created_at)}</td>
  <td>${actionForm("delete", link.id, "Delete", csrfToken)}</td>
</tr>`;
}

export async function buildAdminPage(env, { csrfToken, errors = [], formValues = {} }) {
  const links = await listLinks(env);
  const rows = links.length
    ? links.map((link) => linkRow(link, csrfToken)).join("\n")
    : `<tr><td colspan="4">Nothing saved yet</td></tr>`;

  const errorBlock = errors.length
    ? `<div class="form-errors">${errors.map((e) => `<div>${escapeHtml(e)}</div>`).join("")}</div>`
    : "";

  const body = `
<section class="section">
  <div class="container">
    <h1>Admin</h1>
    <form method="POST" action="/admin/logout"><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><button type="submit">Log out</button></form>

    <h2>Save a link</h2>
    ${errorBlock}
    <form method="POST" action="/admin/api/links/create" class="form">
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <label>URL<input type="text" name="url" required placeholder="https://..." value="${escapeHtml(formValues.rawUrl || "")}"></label>
      <label>Title<input type="text" name="title" required maxlength="200" value="${escapeHtml(formValues.title || "")}"></label>
      <label>Tag<input type="text" name="tag" maxlength="50" value="${escapeHtml(formValues.tag || "")}"></label>
      <button type="submit" class="btn">Save</button>
    </form>

    <h2>Saved (${links.length})</h2>
    <table class="table admin-table">
      <thead><tr><th>Link</th><th>Tag</th><th>Saved</th><th>Action</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;

  return pageShell({
    env,
    title: `Admin | ${SITE_NAME}`,
    description: "Admin panel.",
    canonicalPath: "/admin/",
    body,
  });
}

export async function handleLinksCreate(env, request, session) {
  const form = await request.formData();
  const { valid, errors, data } = validateLinkForm(form);

  if (!valid) {
    return new Response(await buildAdminPage(env, { csrfToken: session.csrf, errors, formValues: data }), {
      status: 400,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  }

  await insertLink(env, data);
  return new Response(null, { status: 303, headers: { Location: "/admin/" } });
}

export async function handleLinksDelete(env, request) {
  const form = await request.formData();
  const id = form.get("id");
  if (id) await deleteLink(env, id);
  return new Response(null, { status: 303, headers: { Location: "/admin/" } });
}
