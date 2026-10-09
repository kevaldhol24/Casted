// npm test — the validator against real records from a headless game run (test/records.json) and broken ones.
import { readFileSync } from 'node:fs';
import { parseRecord } from '../src/validate.ts';

const records = JSON.parse(readFileSync(new URL('./records.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
let failed = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};
const parse = (r: unknown) => parseRecord(r, 1_700_000_000_000);

for (const r of records) {
  const p = parse(r);
  check(`${r.kind} ${r.levelId ?? r.placement ?? ''} is accepted`, !('error' in p));
}
const attempt = records.find((r) => r.kind === 'attempt')!;
const row = parse(attempt);
check('attempt row flattens hints and axis split', !('error' in row) && row.row.hint_count === (attempt.hints as unknown[]).length && typeof row.row.axis_x === 'number');

const broken: [string, unknown][] = [
  ['unknown kind', { ...attempt, kind: 'event' }],
  ['bad uuid', { ...attempt, attemptId: 'not-a-uuid' }],
  ['level id with a slash', { ...attempt, levelId: '1/07' }],
  ['iou above 1', { ...attempt, peakIou: 1.5 }],
  ['unknown outcome', { ...attempt, outcome: 'rage-quit' }],
  ['oversized trace', { ...attempt, iouTrace: Array.from({ length: 601 }, (_, i) => [i * 2000, 0.5]) }],
  ['string where a number goes', { ...attempt, durationMs: '48200' }],
  ['malformed viewport', { ...records[0], viewport: '10.0.0.1' }],
  ['not an object', 'hello'],
];
for (const [name, r] of broken) check(`rejects ${name}`, 'error' in parse(r));
const extra = parse({ ...records[0], ip: '203.0.113.9', userAgent: 'x' });
check('unknown fields (ip, userAgent) never reach the row', !('error' in extra) && !('ip' in extra.row) && !('userAgent' in extra.row));

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');
