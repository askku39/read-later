# Read Later

Personal reading list. Save a link with a title and optional tag, read it
later, delete it when done. Single-admin auth, no accounts, no tracking.

Built from [personal-app-starter](https://github.com/askku39/personal-app-starter)
— Cloudflare Workers + D1, hand-rolled auth/CSRF/sessions, no framework.

## Quick start

```bash
npm install
cp .dev.vars.example .dev.vars
npm run d1:migrate:local
npm run dev
```

Visit `/admin/login`, log in with `ADMIN_TOKEN` from `.dev.vars`.

## Resource: `links`

- `migrations/0001_init.sql` — `links(id, url, title, tag, created_at)`
- `src/db.js` — `listLinks`, `insertLink`, `deleteLink`
- `src/validate.js` — requires `https://` URL + non-blank title, tag optional
- `src/templates/links.js` — public read-only list at `/`
- `src/templates/admin.js` — save/delete UI at `/admin/`

## Testing

```bash
npm run lint
npm test
```

## Deployment

```bash
wrangler d1 create read-later-db
# paste the database_id into wrangler.jsonc, then:
npm run d1:migrate:remote
npm run deploy
```

## License

MIT — see `LICENSE`.
