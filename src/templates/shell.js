import { getSiteUrl, SITE_NAME } from "../config.js";
import { escapeHtml } from "../utils.js";

export function pageShell({ env, title, description, canonicalPath, body }) {
  const canonicalUrl = getSiteUrl(env) + canonicalPath;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonicalUrl}">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <div class="row">
    <a class="brand" href="/">${escapeHtml(SITE_NAME)}</a>
    <nav class="site-nav">
      <a href="/">Home</a>
      <a href="/admin/">Admin</a>
    </nav>
  </div>
</header>
<main class="main-content">${body}</main>
<footer class="site-footer">
  <div class="container">Built with personal-app-starter</div>
</footer>
</body>
</html>
`;
}
