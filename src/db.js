// D1 query functions for the `links` resource.

export async function listLinks(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM links ORDER BY created_at DESC`
  ).all();
  return results;
}

export async function insertLink(env, { url, title, tag }) {
  await env.DB.prepare(
    `INSERT INTO links (url, title, tag) VALUES (?, ?, ?)`
  )
    .bind(url, title, tag || null)
    .run();
}

export async function deleteLink(env, id) {
  await env.DB.prepare(`DELETE FROM links WHERE id = ?`).bind(id).run();
}
