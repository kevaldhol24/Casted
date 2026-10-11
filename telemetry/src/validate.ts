/**
 * Shape checks for the records src/analytics/Analytics.ts sends. A record that fails is dropped (the rest of the
 * batch is kept); every string and list is capped so one record can't bloat the database.
 */

export type Row = Record<string, string | number | null>;
export interface Parsed {
  table: 'sessions' | 'attempts' | 'ad_offers';
  row: Row;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVEL_ID = /^(\d{1,2}-\d{2}|daily-\d{1,5}|endless)$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown, min = 0, max = 1e10): v is number => num(v) && Number.isInteger(v) && v >= min && v <= max;
const str = (v: unknown, max = 40): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const bool = (v: unknown): v is boolean => typeof v === 'boolean';
const iou = (v: unknown): v is number => num(v) && v >= 0 && v <= 1;
const oneOf = <T extends string>(v: unknown, set: readonly T[]): v is T => typeof v === 'string' && (set as readonly string[]).includes(v);
const nullOr = <T>(v: unknown, ok: (x: unknown) => x is T): v is T | null => v === null || ok(v);

/** A list of small objects/tuples, each checked by `ok`, at most `max` long. */
function list(v: unknown, max: number, ok: (x: unknown) => boolean): boolean {
  return Array.isArray(v) && v.length <= max && v.every(ok);
}

class Bad extends Error {}
function need(cond: boolean, field: string): asserts cond {
  if (!cond) throw new Bad(field);
}

const OUTCOMES = ['solved', 'quit-menu', 'quit-levels', 'restart', 'tab-hidden', 'closed', 'game-over', 'abandoned'] as const;
const MODES = ['campaign', 'daily', 'endless'] as const;
const PLACEMENTS = ['hint-reveal', 'bulbs', 'daily-retry', 'daily-double', 'endless-continue', 'midgame'] as const;
const AD_RESULTS = ['rewarded', 'no-fill', 'error', 'played'] as const;
const WIN_ACTIONS = ['next', 'replay', 'menu', 'auto-advance'] as const;
const TIERS = ['nudge', 'peek', 'reveal'] as const;

function session(r: Obj, now: number): Row {
  need(str(r.sessionId) && UUID.test(r.sessionId), 'sessionId');
  need(str(r.playerId) && UUID.test(r.playerId), 'playerId');
  need(str(r.build, 32), 'build');
  need(bool(r.firstVisit), 'firstVisit');
  need(int(r.daysSinceFirst, 0, 100000), 'daysSinceFirst');
  need(str(r.device, 16) && str(r.os, 16) && str(r.browser, 16), 'device');
  need(str(r.viewport, 16) && /^\d{1,5}x\d{1,5}$/.test(r.viewport), 'viewport');
  need(num(r.dpr) && r.dpr > 0 && r.dpr <= 8, 'dpr');
  need(str(r.tier, 16) && str(r.lang, 8), 'tier');
  need(int(r.tzOffset, -900, 900), 'tzOffset');
  need(nullOr(r.loadMs, int) && nullOr(r.firstInputMs, int) && nullOr(r.endMs, int), 'times');
  need(r.endReason === null || oneOf(r.endReason, ['pagehide', 'tab-hidden'] as const), 'endReason');
  need(int(r.levelsSolved, 0, 10000), 'levelsSolved');
  need(r.furthestLevel === null || (str(r.furthestLevel, 8) && LEVEL_ID.test(r.furthestLevel)), 'furthestLevel');
  return {
    session_id: r.sessionId,
    player_id: r.playerId,
    build: r.build,
    first_visit: r.firstVisit ? 1 : 0,
    days_since_first: r.daysSinceFirst,
    device: r.device,
    os: r.os,
    browser: r.browser,
    viewport: r.viewport,
    dpr: r.dpr,
    tier: r.tier,
    lang: r.lang,
    tz_offset: r.tzOffset,
    load_ms: r.loadMs as number | null,
    first_input_ms: r.firstInputMs as number | null,
    end_ms: r.endMs as number | null,
    end_reason: r.endReason as string | null,
    levels_solved: r.levelsSolved,
    furthest_level: r.furthestLevel as string | null,
    received_at: now,
  };
}

function attempt(r: Obj, now: number): Row {
  need(str(r.attemptId) && UUID.test(r.attemptId), 'attemptId');
  need(str(r.sessionId) && UUID.test(r.sessionId), 'sessionId');
  need(str(r.levelId, 16) && LEVEL_ID.test(r.levelId), 'levelId');
  need(int(r.world, 1, 20) && oneOf(r.mode, MODES), 'world/mode');
  need(int(r.attemptNo, 1, 10000) && bool(r.isReplay), 'attemptNo');
  need(int(r.startAt) && nullOr(r.firstDragMs, int), 'startAt');
  need(int(r.durationMs) && int(r.activeMs) && int(r.idleMs), 'durations');
  need(oneOf(r.outcome, OUTCOMES), 'outcome');
  need(r.stars === null || int(r.stars, 1, 3), 'stars');
  need(int(r.parMs), 'parMs');
  need(iou(r.startIou) && iou(r.threshold) && iou(r.finalIou) && iou(r.peakIou), 'iou');
  need(int(r.peakAtMs) && int(r.stuckMs) && int(r.nearMissMs), 'peakAt/stuck');
  need(int(r.drags, 0, 100000) && int(r.rotationDeg), 'drags');
  const a = r.axisSplit;
  need(isObj(a) && iou(a.x) && iou(a.y) && iou(a.roll), 'axisSplit');
  need(int(r.switches, 0, 100000) && int(r.lampMoves, 0, 100000) && int(r.lampMs), 'switch/lamp');
  need(list(r.iouTrace, 600, (p) => Array.isArray(p) && p.length === 2 && int(p[0]) && iou(p[1])), 'iouTrace');
  need(
    list(r.hints, 50, (h) => isObj(h) && oneOf(h.tier, TIERS) && int(h.atMs) && iou(h.iouBefore) && nullOr(h.iouAfter, iou) && oneOf(h.paid, ['free', 'bulb', 'ad'] as const)),
    'hints',
  );
  need(list(r.hintPanelOpens, 50, (h) => isObj(h) && int(h.atMs) && bool(h.closedWithoutUse)), 'hintPanelOpens');
  need(list(r.promptsShown, 50, (p) => isObj(p) && str(p.type, 24) && int(p.atMs)), 'promptsShown');
  need(list(r.pauses, 200, (p) => isObj(p) && int(p.atMs) && int(p.durMs)), 'pauses');
  need(int(r.bulbsBefore, 0, 1e6) && int(r.bulbsAfter, 0, 1e6), 'bulbs');
  need(r.winAction === null || oneOf(r.winAction, WIN_ACTIONS), 'winAction');
  need(nullOr(r.winScreenMs, int), 'winScreenMs');

  let extras: Obj | null = null;
  if (r.mode === 'daily') {
    need(int(r.dailyNo, 1, 100000) && int(r.streak, 0, 100000) && bool(r.shared), 'daily');
    extras = { dailyNo: r.dailyNo, streak: r.streak, shared: r.shared };
  } else if (r.mode === 'endless') {
    need(int(r.score, 0, 1e9) && int(r.solves, 0, 100000) && int(r.multiplierMax, 1, 1000), 'endless');
    need(bool(r.continueUsed) && int(r.targetsSeen, 0, 100000), 'endless');
    need(list(r.solveMs, 500, (v) => int(v)), 'solveMs');
    extras = { score: r.score, solves: r.solves, multiplierMax: r.multiplierMax, continueUsed: r.continueUsed, targetsSeen: r.targetsSeen, solveMs: r.solveMs };
  }
  const hints = r.hints as Obj[];
  return {
    attempt_id: r.attemptId,
    session_id: r.sessionId,
    level_id: r.levelId,
    world: r.world,
    mode: r.mode,
    attempt_no: r.attemptNo,
    is_replay: r.isReplay ? 1 : 0,
    start_at: r.startAt,
    first_drag_ms: r.firstDragMs as number | null,
    duration_ms: r.durationMs,
    active_ms: r.activeMs,
    idle_ms: r.idleMs,
    outcome: r.outcome,
    stars: r.stars as number | null,
    par_ms: r.parMs,
    start_iou: r.startIou,
    threshold: r.threshold,
    final_iou: r.finalIou,
    peak_iou: r.peakIou,
    peak_at_ms: r.peakAtMs,
    stuck_ms: r.stuckMs,
    near_miss_ms: r.nearMissMs,
    drags: r.drags,
    rotation_deg: r.rotationDeg,
    axis_x: a.x,
    axis_y: a.y,
    axis_roll: a.roll,
    switches: r.switches,
    lamp_moves: r.lampMoves,
    lamp_ms: r.lampMs,
    hint_count: hints.length,
    first_hint_ms: hints.length ? (hints[0].atMs as number) : null,
    hint_panel_opens: (r.hintPanelOpens as unknown[]).length,
    bulbs_before: r.bulbsBefore,
    bulbs_after: r.bulbsAfter,
    win_action: r.winAction as string | null,
    win_screen_ms: r.winScreenMs as number | null,
    iou_trace: JSON.stringify(r.iouTrace),
    hints: JSON.stringify(r.hints),
    hint_panels: JSON.stringify(r.hintPanelOpens),
    prompts: JSON.stringify(r.promptsShown),
    pauses: JSON.stringify(r.pauses),
    extras: extras ? JSON.stringify(extras) : null,
    received_at: now,
  };
}

function adOffer(r: Obj, now: number): Row {
  need(str(r.sessionId) && UUID.test(r.sessionId), 'sessionId');
  need(oneOf(r.placement, PLACEMENTS), 'placement');
  need(r.levelId === null || (str(r.levelId, 16) && LEVEL_ID.test(r.levelId)), 'levelId');
  need(int(r.atMs) && bool(r.shown) && bool(r.accepted), 'atMs/shown');
  need(r.result === null || oneOf(r.result, AD_RESULTS), 'result');
  need(nullOr(r.durMs, int), 'durMs');
  return {
    session_id: r.sessionId,
    placement: r.placement,
    level_id: r.levelId as string | null,
    at_ms: r.atMs,
    shown: r.shown ? 1 : 0,
    accepted: r.accepted ? 1 : 0,
    result: r.result as string | null,
    dur_ms: r.durMs as number | null,
    received_at: now,
  };
}

/** One record → its table row, or the name of the first field that failed. */
export function parseRecord(r: unknown, now: number): Parsed | { error: string } {
  try {
    need(isObj(r), 'record');
    if (r.kind === 'session') return { table: 'sessions', row: session(r, now) };
    if (r.kind === 'attempt') return { table: 'attempts', row: attempt(r, now) };
    if (r.kind === 'ad') return { table: 'ad_offers', row: adOffer(r, now) };
    return { error: 'kind' };
  } catch (e) {
    return { error: e instanceof Bad ? e.message : 'record' };
  }
}
