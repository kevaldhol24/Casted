# Casted telemetry (Analytics Layer B)

A Cloudflare Worker + D1 database that stores the game's own analytics records (`src/analytics/Analytics.ts`):
one row per session, per level attempt and per ad offer. The game only sends to it when it was built with
`VITE_TELEMETRY_URL`; without that, nothing leaves the game.

- `POST /e` takes a JSON array of 1–200 records (the body is sent as `text/plain`, so browsers skip the CORS
  preflight). Bodies over 64 KB get `413`; a body that isn't a JSON array gets `400`; records that fail validation are
  dropped and the rest are stored (`{"stored": n, "rejected": m}`).
- Only allowed origins (`ALLOWED_ORIGINS` in `wrangler.toml`) get in; anything else gets `403`.
- No IP address or user agent is read or stored, and request logs are off (`[observability] enabled = false`).
- A daily cron deletes rows older than `RETENTION_DAYS` (365), matching the privacy page.

Files: `src/index.ts` (Worker), `src/validate.ts` (record checks), `schema.sql` (tables), `queries/*.sql` (saved
queries), `test/` (validator test with real records from a game run).

## Deploy (about 10 minutes, free tier)

Run everything from this folder (`telemetry/`).

1. `npm install`
2. `npx wrangler login` (opens the browser; use the Cloudflare account that should own the data).
3. `npx wrangler d1 create casted-telemetry` — copy the `database_id` it prints into `wrangler.toml`.
4. `npm run db:init` — creates the three tables in the remote database.
5. `npx wrangler deploy` — prints the Worker's address:

   ```
   https://casted-telemetry.<your-subdomain>.workers.dev
   ```

   `<your-subdomain>` is your account's workers.dev subdomain (also shown in the Cloudflare dashboard under
   Workers & Pages). The ingest endpoint is that address plus `/e`.
6. Check it answers (should print `{"stored":4,"rejected":0}`):

   ```
   curl -H "Origin: https://castedweb.netlify.app" --data-binary @test/records.json https://casted-telemetry.<your-subdomain>.workers.dev/e
   ```

   Then clear that test data: `npx wrangler d1 execute casted-telemetry --remote --command "DELETE FROM sessions; DELETE FROM attempts; DELETE FROM ad_offers;"`

## Turn it on in the game

1. **Poki first.** Poki blocks every request outside the game's own files until it approves them. In Poki for
   Developers → your game → **Settings → CSP**, request this exact URL:

   ```
   https://casted-telemetry.<your-subdomain>.workers.dev
   ```

   Poki also wants the privacy page: it ships in the build as `privacy.html` (linked from Settings in the game); the
   live copy is <https://castedweb.netlify.app/privacy.html>. Replace `CONTACT_EMAIL` in `public/privacy.html` first.
2. After approval, build with the endpoint and upload the new build:

   ```
   VITE_TELEMETRY_URL=https://casted-telemetry.<your-subdomain>.workers.dev/e npm run build:poki
   ```

   (PowerShell: `$env:VITE_TELEMETRY_URL="https://…/e"; npm run build:poki`.) Before approval, keep building without
   it: a blocked request would show as a console error in Poki's QA.
3. On the first Poki Inspector run, open DevTools → Network, find the `e` request and check its `Origin` header is
   matched by `ALLOWED_ORIGINS` (Poki serves builds from `*.poki-gdn.com`). If it's a `403`, add that origin and
   `npx wrangler deploy` again.

## Saved queries

```
npx wrangler d1 execute casted-telemetry --remote --file=queries/solve-time.sql
```

| File | Answers |
| --- | --- |
| `queries/solve-time.sql` | Per level: solves, median and p75 solve time |
| `queries/level-funnel.sql` | Per level: attempts, quit rate, explicit quits (Menu / Levels / Restart), hint rate, median time to first hint |
| `queries/stuck-near-miss.sql` | Per level: median `stuckMs` and median `nearMissMs` |
| `queries/rewarded.sql` | Per rewarded placement: offers shown, pressed, interact rate, fill rate; midgame requests and show rate |

Add `--json` for machine-readable output. Percentiles are nearest-rank (SQLite has no `MEDIAN`).

## Local testing

```
npm run db:init:local
npx wrangler dev --local --test-scheduled
curl -H "Origin: http://localhost:5173" --data-binary @test/records.json http://127.0.0.1:8787/e
curl "http://127.0.0.1:8787/__scheduled?cron=17+3+*+*+*"   # run the retention sweep
npx wrangler d1 execute casted-telemetry --local --file=queries/level-funnel.sql
npm test        # validator test
npm run typecheck
```

To send from the game locally: `VITE_TELEMETRY_URL=http://127.0.0.1:8787/e npm run dev`.

## Notes

- An attempt can arrive more than once (a snapshot when the tab is hidden, then the real end). The Worker keeps the
  copy with the longest `duration_ms`. Sessions are rewritten by their later copies (page hide).
- Ad offers are plain inserts; the game sends each one once.
- There is no rate limiting; Cloudflare's free tier allows 100k requests a day. Add a rate-limit rule in the dashboard
  if the endpoint is ever abused.
