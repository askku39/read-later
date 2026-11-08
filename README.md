# Read Later

Personal reading list. Save a link with a title and optional tag, read it
later, delete it when done. Single-admin auth, no accounts, no tracking.

Built from [personal-app-starter](https://github.com/askku39/personal-app-starter)
— Cloudflare Workers + D1, hand-rolled auth/CSRF/sessions, no framework.

The homepage and all saved links, titles, tags, and timestamps are intentionally
public. Authentication protects administration only.

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run d1:migrate:local
npm run dev
```

Visit `http://localhost:8787/admin/login`, log in with `ADMIN_TOKEN` from
`.dev.vars`. Use `localhost` for local Secure-cookie testing, with `SITE_URL`
matching `http://localhost:8787`. Local migrations do not need a Cloudflare account.

## Resource: `links`

- `migrations/0001_init.sql` — `links(id, url, title, tag, created_at)`
- `src/db.js` — `listLinks`, `insertLink`, `deleteLink`
- `src/validate.js` — requires a credential-free `https://` URL (at most 2048 characters)
  and a non-blank title; tag optional
- `src/templates/links.js` — public read-only list at `/`
- `src/templates/admin.js` — save/delete UI at `/admin/`

## Testing

```bash
npm run lint
npm test
```

## Deployment

With Cloudflare access configured, create the production database:

```bash
npx wrangler d1 create read-later-db
```

Paste the returned `database_id` into `wrangler.jsonc`. Set `vars.SITE_URL`
in that file to the real deployed HTTPS origin, with no trailing slash.
A wrong origin causes login and authenticated POSTs to fail their origin check.

Set `ADMIN_TOKEN` using the secret prompt below. Supply at least 32 randomly
generated characters; never put the value in source code or command arguments.
Admin is disabled if the token is missing or shorter than 32 characters.

```bash
npx wrangler secret put ADMIN_TOKEN
npm run d1:migrate:remote
npm run lint && npm test
npm run deploy
```

## Security behavior

- Login POST checks Origin, or Referer when Origin is absent, against `SITE_URL`.
  Authenticated admin POSTs also require a per-session CSRF token.
- All admin responses, including login, logout, and session responses, use
  `Cache-Control: no-store`. HTML uses CSP `frame-ancestors 'none'`.
- Forms have a 16 KB body limit (413 above the limit); malformed forms return
  a generic 400 and unexpected failures return a generic 500.
- Sessions expire after 24 hours. Logout clears the browser cookie; a copied
  cookie remains valid until expiry unless `ADMIN_TOKEN` is changed.
- Login throttling is per isolate: five failures per 15 minutes per IP, tracking
  at most 1,000 IPs. When full, new IPs are untracked until space becomes available.

## License

MIT — see `LICENSE`.
