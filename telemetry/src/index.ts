/**
 * Casted telemetry Worker. POST /e takes a JSON array of records from the game (src/analytics/Analytics.ts) and
 * stores them in D1. It never reads or stores the client IP or user agent: the only request headers it looks at
 * are Origin (allowlist) and Content-Length (size cap). A daily cron deletes rows older than RETENTION_DAYS.
 */
import { parseRecord, type Parsed } from './validate';

export interface Env {
  DB: D1Database;
  /** Comma-separated origins; `*` matches one subdomain label, e.g. https://*.crazygames.com */
  ALLOWED_ORIGINS: string;
  RETENTION_DAYS?: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_RECORDS = 200;

function originAllowed(origin: string | null, list: string): boolean {
  if (!origin) return false;
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((pattern) => {
      const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i');
      return re.test(origin);
    });
}

function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Upserts: a session row is rewritten by its later copies (page hide); an attempt keeps its longest version. */
function statement(db: D1Database, p: Parsed): D1PreparedStatement {
  const cols = Object.keys(p.row);
  const marks = cols.map(() => '?').join(', ');
  const values = cols.map((c) => p.row[c]);
  if (p.table === 'ad_offers') return db.prepare(`INSERT INTO ad_offers (${cols.join(', ')}) VALUES (${marks})`).bind(...values);
  const key = p.table === 'sessions' ? 'session_id' : 'attempt_id';
  const keep = p.table === 'sessions' ? new Set([key, 'player_id', 'first_visit']) : new Set([key]);
  const set = cols.filter((c) => !keep.has(c)).map((c) => `${c} = excluded.${c}`).join(', ');
  const guard = p.table === 'attempts' ? ' WHERE excluded.duration_ms >= attempts.duration_ms' : '';
  return db.prepare(`INSERT INTO ${p.table} (${cols.join(', ')}) VALUES (${marks}) ON CONFLICT(${key}) DO UPDATE SET ${set}${guard}`).bind(...values);
}

async function ingest(req: Request, env: Env, origin: string): Promise<Response> {
  const headers = cors(origin);
  const declared = Number(req.headers.get('Content-Length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: 'too large' }, 413, headers);
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) return json({ error: 'too large' }, 413, headers);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return json({ error: 'not json' }, 400, headers);
  }
  if (!Array.isArray(body) || body.length === 0 || body.length > MAX_RECORDS) return json({ error: 'expected an array of 1-200 records' }, 400, headers);

  const now = Date.now();
  const ok: Parsed[] = [];
  const rejected: string[] = [];
  for (const r of body) {
    const p = parseRecord(r, now);
    if ('error' in p) rejected.push(p.error);
    else ok.push(p);
  }
  if (ok.length) await env.DB.batch(ok.map((p) => statement(env.DB, p)));
  return json({ stored: ok.length, rejected: rejected.length, ...(rejected.length ? { firstError: rejected[0] } : {}) }, 200, headers);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/e') return new Response('Not found', { status: 404 });
    const origin = req.headers.get('Origin');
    if (!originAllowed(origin, env.ALLOWED_ORIGINS)) return new Response('Forbidden', { status: 403 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin!) });
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors(origin!) });
    try {
      return await ingest(req, env, origin!);
    } catch {
      return json({ error: 'server' }, 500, cors(origin!));
    }
  },

  /** Daily retention sweep. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const days = Number(env.RETENTION_DAYS ?? 365);
    const cutoff = Date.now() - days * 86_400_000;
    await env.DB.batch(['sessions', 'attempts', 'ad_offers'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE received_at < ?`).bind(cutoff)));
  },
} satisfies ExportedHandler<Env>;
