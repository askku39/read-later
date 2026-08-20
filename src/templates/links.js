import { listLinks } from "../db.js";
import { escapeHtml } from "../utils.js";
import { pageShell } from "./shell.js";

function linkRow(link) {
  return `
<tr>
  <td><a href="${escapeHtml(link.url)}" rel="noopener noreferrer">${escapeHtml(link.title)}</a></td>
  <td>${link.tag ? `<span class="tag">${escapeHtml(link.tag)}</span>` : ""}</td>
  <td>${escapeHtml(link.created_at)}</td>
</tr>`;
}

// Public, read-only reading list.
export async function buildIndexPage(env) {
  const links = await listLinks(env);
  const rows = links.length
    ? links.map(linkRow).join("\n")
    : `<tr><td colspan="3">Nothing saved yet</td></tr>`;

  const body = `
<section class="section">
  <div class="container">
    <h1>Read later</h1>
    <table class="table">
      <thead><tr><th>Link</th><th>Tag</th><th>Saved</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;

  return pageShell({
    env,
    title: "Read later",
    description: "Saved links to read later.",
    canonicalPath: "/",
    body,
  });
}
