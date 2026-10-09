import type { HintTier } from '../core/Store';
import type { LevelDef } from '../levels/levels';
import type { Portal } from '../portal/Portal';

/**
 * Analytics (progress doc, "Analytics spec"). Game code calls track(event) and nothing else:
 *  A  — PokiSDK measure(category, what, action) through the portal (funnels on Poki for Developers);
 *  A+ — one console.info line per attempt end, for playtest recordings;
 *  B  — session / level-attempt / ad-offer records. Sent only when the build sets VITE_TELEMETRY_URL (each attempt
 *       record when it ends, the rest with sendBeacon on page hide); otherwise kept in a 200-record buffer
 *       (window.__castedAnalytics in dev). Nothing here may block, slow or throw into the game: every entry point
 *       swallows its errors (dev re-throws them on a later tick so they still show up).
 * Attempt times (atMs, durationMs, iouTrace…) run on the attempt clock: playing and not suspended, like the level
 * timer. Session times (startAt, ad atMs) are ms since page start.
 */

type Mode = 'campaign' | 'daily' | 'endless';
export type Placement = 'hint-reveal' | 'bulbs' | 'daily-retry' | 'daily-double' | 'endless-continue';
type Outcome = 'solved' | 'quit-menu' | 'quit-levels' | 'restart' | 'tab-hidden' | 'closed' | 'game-over' | 'abandoned';
type Lamp = { yaw: number; pitch: number } | null;

export type AnalyticsEvent =
  /** Page start → gameLoadingFinished. */
  | { type: 'loaded' }
  | { type: 'quality'; tier: string }
  /** The main menu is on screen (ends an unfinished attempt as quit-menu). */
  | { type: 'menu' }
  /** A level was set up for play (campaign level, Daily, or the first Endless target). */
  | { type: 'attempt'; level: LevelDef; mode: Mode; startIou: number; bulbs: number; replay: boolean; hintButton: boolean; dailyNo?: number; streak?: number }
  /** Endless: the next target of the same run. */
  | { type: 'target'; level: LevelDef }
  /** Every frame: the level's own score and clock state (no extra renders). */
  | { type: 'tick'; dt: number; iou: number; running: boolean; suspended: boolean; lamp: Lamp; busy: boolean }
  | { type: 'input'; kind: 'grab' | 'key' | 'lamp' }
  | { type: 'drag'; yaw: number; pitch: number; roll: number }
  | { type: 'switch' }
  | { type: 'prompt'; prompt: string }
  /** The hint button was tapped (or H pressed). */
  | { type: 'hint-button' }
  | { type: 'hint-panel'; action: 'open' | 'close' }
  | { type: 'hint'; tier: HintTier; paid: 'free' | 'bulb' | 'ad' }
  | { type: 'solved'; stars: number; timeS: number; bulbs: number }
  | { type: 'end'; outcome: 'quit-menu' | 'quit-levels' | 'restart'; bulbs: number }
  | { type: 'win-action'; action: 'next' | 'replay' | 'menu' | 'auto-advance' }
  | { type: 'offer'; placement: Placement; action: 'visible' }
  | { type: 'offer'; placement: Placement; action: 'interact' }
  | { type: 'offer'; placement: Placement; action: 'result'; result: 'rewarded' | 'no-fill' | 'error'; durMs: number }
  /** The panel or card holding offers closed: offers never pressed are logged as shown, not accepted. */
  | { type: 'offers-closed' }
  | { type: 'midgame'; shown: boolean; durMs: number }
  | { type: 'daily-share' }
  | { type: 'endless-solve'; ms: number; score: number; mult: number }
  | { type: 'endless-over'; score: number; solves: number }
  | { type: 'endless-continue' };

const RECORD_CAP = 200;
const TRACE_EVERY_MS = 2000;
const TRACE_MAX = 600;
const IDLE_AFTER_MS = 3000;
const STUCK_GAIN = 0.03;
const NEAR_MISS_FROM = 0.75;
const HINT_EFFECT_MS = 2000;
const TELEMETRY_URL: string | undefined = import.meta.env.VITE_TELEMETRY_URL || undefined;
const STORAGE_KEY = 'casted.analytics';

const r2 = (v: number) => Math.round(v * 100) / 100;
const ms = (v: number) => Math.round(v);
const now = () => performance.now();

/** "w1-07" → "1-07" (the measure() / record form). */
export const shortId = (id: string) => id.replace(/^w(\d+)-/, '$1-');

export function timeBucket(s: number): string {
  return s < 15 ? '0-15s' : s < 30 ? '15-30s' : s < 60 ? '30-60s' : s < 120 ? '60-120s' : '120s-plus';
}

export function scoreBucket(score: number): string {
  return score < 500 ? '0-500' : score < 1500 ? '500-1500' : score < 3000 ? '1500-3000' : '3000-plus';
}

function uuid(): string {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function deviceInfo() {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 0;
  const os = /Android/i.test(ua)
    ? 'android'
    : /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touch)
      ? 'ios'
      : /Windows/i.test(ua)
        ? 'windows'
        : /CrOS/.test(ua)
          ? 'chromeos'
          : /Mac OS X/.test(ua)
            ? 'macos'
            : /Linux/i.test(ua)
              ? 'linux'
              : 'other';
  const browser = /Edg\//.test(ua)
    ? 'edge'
    : /OPR\//.test(ua)
      ? 'opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'chrome'
          : /Safari\//.test(ua)
            ? 'safari'
            : 'other';
  const short = Math.min(screen.width, screen.height);
  const device = !touch ? 'desktop' : short >= 600 ? 'tablet' : 'mobile';
  return { device, os, browser };
}

interface Stored {
  playerId: string;
  firstSeen: string;
  flags: Record<string, boolean>;
}

/** The player's random id and first-visit date (own key; never part of the game save). */
function loadStored(): { data: Stored; firstVisit: boolean } {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Stored;
      if (d.playerId && d.firstSeen) return { data: { ...d, flags: d.flags ?? {} }, firstVisit: false };
    }
  } catch {}
  return { data: { playerId: uuid(), firstSeen: today, flags: {} }, firstVisit: true };
}

interface HintRec {
  tier: HintTier;
  atMs: number;
  iouBefore: number;
  iouAfter: number | null;
  paid: 'free' | 'bulb' | 'ad';
}

interface AttemptRecord {
  kind: 'attempt';
  attemptId: string;
  sessionId: string;
  levelId: string;
  world: number;
  mode: Mode;
  attemptNo: number;
  isReplay: boolean;
  startAt: number;
  firstDragMs: number | null;
  durationMs: number;
  activeMs: number;
  idleMs: number;
  outcome: Outcome | null;
  stars: number | null;
  parMs: number;
  startIou: number;
  threshold: number;
  finalIou: number;
  peakIou: number;
  peakAtMs: number;
  iouTrace: [number, number][];
  stuckMs: number;
  nearMissMs: number;
  drags: number;
  rotationDeg: number;
  axisSplit: { x: number; y: number; roll: number };
  switches: number;
  lampMoves: number;
  lampMs: number;
  hints: HintRec[];
  hintPanelOpens: { atMs: number; closedWithoutUse: boolean }[];
  promptsShown: { type: string; atMs: number }[];
  pauses: { atMs: number; durMs: number }[];
  bulbsBefore: number;
  bulbsAfter: number;
  winAction: 'next' | 'replay' | 'menu' | 'auto-advance' | null;
  winScreenMs: number | null;
  // Daily extras
  dailyNo?: number;
  streak?: number;
  shared?: boolean;
  // Endless extras
  score?: number;
  solves?: number;
  multiplierMax?: number;
  continueUsed?: boolean;
  targetsSeen?: number;
  solveMs?: number[];
}

interface AdRecord {
  kind: 'ad';
  sessionId: string;
  placement: Placement | 'midgame';
  levelId: string | null;
  atMs: number;
  shown: boolean;
  accepted: boolean;
  result: 'rewarded' | 'no-fill' | 'error' | 'played' | null;
  durMs: number | null;
}

interface SessionRecord {
  kind: 'session';
  sessionId: string;
  playerId: string;
  build: string;
  firstVisit: boolean;
  daysSinceFirst: number;
  device: string;
  os: string;
  browser: string;
  viewport: string;
  dpr: number;
  tier: string;
  lang: string;
  tzOffset: number;
  loadMs: number | null;
  firstInputMs: number | null;
  endMs: number | null;
  endReason: 'pagehide' | 'tab-hidden' | null;
  levelsSolved: number;
  furthestLevel: string | null;
}

type AnyRecord = SessionRecord | AttemptRecord | AdRecord;

/** Live state of the open attempt (the record plus what's needed to fill it). */
interface Live {
  rec: AttemptRecord;
  /** Attempt clock, ms. */
  t: number;
  started: boolean;
  solved: boolean;
  solvedAt: number;
  endlessOver: boolean;
  anchor: number;
  stretchStart: number;
  nextTrace: number;
  lastInput: number;
  lamp: Lamp;
  lampMoving: boolean;
  lampStill: number;
  pauseFrom: number | null;
  pauseAtMs: number;
  iou: number;
  hintDue: { hint: HintRec; at: number }[];
  panelOpen: { atMs: number; closedWithoutUse: boolean } | null;
  firstHintMeasured: boolean;
  switchMeasured: boolean;
  lampMeasured: boolean;
  /** The hint button is on screen in this attempt. */
  hintButton: boolean;
}

export class Analytics {
  readonly sessionId = uuid();
  private stored: Stored;
  private session: SessionRecord;
  private live: Live | null = null;
  /** The last attempt's level: a midgame between levels belongs to the one just played. */
  private lastLevelId: string | null = null;
  /** Attempts per level id this session (attemptNo). */
  private attemptsByLevel = new Map<string, number>();
  private worldsSeen = new Set<number>();
  private furthest = -1;
  private offers: AdRecord[] = [];
  private closingOffers = false;
  private recordCount = 0;
  /** Ring buffer of every record built (dev view; also what a test dumps). */
  readonly records: AnyRecord[] = [];
  readonly measures: [string, string, string][] = [];
  readonly summaries: string[] = [];
  private outbox: AnyRecord[] = [];
  /** pagehide has fired: the page is going away. */
  private closed = false;
  private tier = 'unknown';

  constructor(private portal: Portal) {
    const { data, firstVisit } = loadStored();
    this.stored = data;
    this.persist();
    const days = Math.max(0, Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(data.firstSeen)) / 86_400_000));
    this.session = {
      kind: 'session',
      sessionId: this.sessionId,
      playerId: data.playerId,
      build: __CASTED_BUILD__,
      firstVisit,
      daysSinceFirst: days,
      ...deviceInfo(),
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: r2(devicePixelRatio || 1),
      tier: this.tier,
      lang: (navigator.language || 'en').slice(0, 2),
      tzOffset: new Date().getTimezoneOffset(),
      loadMs: null,
      firstInputMs: null,
      endMs: null,
      endReason: null,
      levelsSolved: 0,
      furthestLevel: null,
    };
    // Page hide: snapshot the open attempt and flush everything with sendBeacon.
    document.addEventListener('visibilitychange', () => this.safe(() => document.hidden && this.pageHidden('tab-hidden')));
    addEventListener('pagehide', () => this.safe(() => this.pageHidden('closed')));
    // Back from the bfcache: the page lives on.
    addEventListener('pageshow', (e) => this.safe(() => e.persisted && (this.closed = false)));
    if (import.meta.env.DEV) Object.assign(window, { __castedAnalytics: this });
  }

  /** The one entry point. Never throws. */
  track(e: AnalyticsEvent) {
    this.safe(() => this.handle(e));
  }

  private safe(fn: () => unknown) {
    try {
      fn();
    } catch (err) {
      // Never into the game loop; in dev, surface it on a fresh stack.
      if (import.meta.env.DEV) setTimeout(() => {
        throw err;
      });
    }
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stored));
    } catch {}
  }

  // --- Layer A ---------------------------------------------------------------------------------------

  private measure(category: string, what: string, action: string) {
    for (const v of [category, what, action]) if (/[/^]/.test(v)) throw new Error(`[analytics] measure value "${v}" contains / or ^`);
    if (import.meta.env.DEV) this.measures.push([category, what, action]);
    this.portal.measure?.(category, what, action);
  }

  /** Once per player (onboarding milestones). */
  private milestone(name: string) {
    if (this.stored.flags[name]) return;
    this.stored.flags[name] = true;
    this.persist();
    this.measure('onboarding', name, 'reached');
  }

  // --- Layer B ---------------------------------------------------------------------------------------

  private emit(rec: AnyRecord, sendNow = false) {
    if (this.recordCount >= RECORD_CAP) return;
    this.recordCount++;
    const copy = structuredClone(rec);
    this.records.push(copy);
    if (!TELEMETRY_URL) return;
    this.outbox.push(copy);
    if (sendNow) this.send(false);
  }

  /** POST the outbox as one batch (text/plain: no CORS preflight). Failures drop the batch silently. */
  private send(beacon: boolean) {
    if (!TELEMETRY_URL || !this.outbox.length) return;
    const body = JSON.stringify(this.outbox);
    this.outbox = [];
    try {
      if (beacon && navigator.sendBeacon?.(TELEMETRY_URL, new Blob([body], { type: 'text/plain' }))) return;
      fetch(TELEMETRY_URL, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
    } catch {}
  }

  private pageHidden(reason: 'tab-hidden' | 'closed') {
    // Closing fires pagehide and then visibilitychange; the later "hidden" must not overwrite "closed".
    if (this.closed) return;
    if (reason === 'closed') this.closed = true;
    const l = this.live;
    if (l?.started) {
      // A snapshot, not the end: if the player comes back, the same attemptId is sent again when it ends.
      const snap = this.finishRecord(l, l.solved ? 'solved' : reason);
      this.emit(snap);
    }
    this.flushOffers();
    this.session.endMs = ms(now());
    this.session.endReason = reason === 'closed' ? 'pagehide' : 'tab-hidden';
    this.session.tier = this.tier;
    this.emit(this.session);
    this.send(true);
  }

  // --- events ----------------------------------------------------------------------------------------

  private handle(e: AnalyticsEvent) {
    const l = this.live;
    switch (e.type) {
      case 'loaded':
        this.session.loadMs = ms(now());
        this.session.tier = this.tier;
        this.measure('quality', 'tier', this.tier);
        this.emit(this.session, true);
        return;
      case 'quality':
        if (e.tier !== this.tier && this.session.loadMs !== null) this.measure('quality', 'tier', e.tier);
        this.tier = e.tier;
        return;
      case 'menu':
        this.endAttempt('quit-menu');
        this.milestone('menu-seen');
        return;
      case 'attempt':
        return this.startAttempt(e);
      case 'target':
        if (l && l.rec.mode === 'endless') {
          l.rec.targetsSeen = (l.rec.targetsSeen ?? 0) + 1;
          l.rec.threshold = e.level.threshold;
        }
        return;
      case 'tick':
        return this.tick(e);
      case 'input':
      case 'drag':
        return this.input(e);
      case 'switch':
        if (!l?.started) return;
        l.rec.switches++;
        if (!l.switchMeasured) {
          l.switchMeasured = true;
          this.measure('switch', this.measureId(l), 'used');
        }
        return;
      case 'prompt':
        if (l?.started) l.rec.promptsShown.push({ type: e.prompt, atMs: ms(l.t) });
        return;
      case 'hint-button':
        this.measure('button', 'hint', 'interact');
        return;
      case 'hint-panel':
        if (!l) return;
        if (e.action === 'open') {
          l.panelOpen = { atMs: ms(l.t), closedWithoutUse: true };
          l.rec.hintPanelOpens.push(l.panelOpen);
        } else l.panelOpen = null;
        return;
      case 'hint':
        return this.hint(e.tier, e.paid);
      case 'solved':
        return this.solved(e);
      case 'end':
        if (l) l.rec.bulbsAfter = e.bulbs;
        return this.endAttempt(e.outcome);
      case 'win-action':
        if (l?.solved) {
          l.rec.winAction = e.action;
          l.rec.winScreenMs = ms(now() - l.solvedAt);
        }
        return this.endAttempt('solved');
      case 'offer':
        return this.offer(e);
      case 'offers-closed':
        // Deferred one microtask: a button that closes its panel and then plays the ad reports "interact" right
        // after this, and must still find its offer.
        if (this.closingOffers) return;
        this.closingOffers = true;
        queueMicrotask(() => this.safe(() => this.flushOffers()));
        return;
      case 'midgame':
        this.emit({ kind: 'ad', sessionId: this.sessionId, placement: 'midgame', levelId: l ? l.rec.levelId : this.lastLevelId, atMs: ms(now()), shown: e.shown, accepted: true, result: e.shown ? 'played' : 'no-fill', durMs: ms(e.durMs) });
        return;
      case 'daily-share':
        this.measure('daily', 'share', 'interact');
        if (l?.rec.mode === 'daily') l.rec.shared = true;
        return;
      case 'endless-solve':
        if (!l || l.rec.mode !== 'endless') return;
        l.rec.solves = (l.rec.solves ?? 0) + 1;
        l.rec.solveMs!.push(ms(e.ms));
        l.rec.score = e.score;
        l.rec.multiplierMax = Math.max(l.rec.multiplierMax ?? 1, e.mult);
        return;
      case 'endless-over':
        if (!l || l.rec.mode !== 'endless') return;
        l.endlessOver = true;
        l.rec.score = e.score;
        l.rec.solves = e.solves;
        return;
      case 'endless-continue':
        if (!l || l.rec.mode !== 'endless') return;
        l.endlessOver = false;
        l.rec.continueUsed = true;
        return;
    }
  }

  /** What measure() calls the level: "1-07", or the mode for Daily / Endless. */
  private measureId(l: Live) {
    return l.rec.mode === 'campaign' ? l.rec.levelId : l.rec.mode;
  }

  private startAttempt(e: Extract<AnalyticsEvent, { type: 'attempt' }>) {
    if (this.live) this.endAttempt('abandoned');
    const levelId = e.mode === 'campaign' ? shortId(e.level.id) : e.mode === 'daily' ? `daily-${e.dailyNo}` : 'endless';
    const n = (this.attemptsByLevel.get(levelId) ?? 0) + 1;
    this.attemptsByLevel.set(levelId, n);
    const rec: AttemptRecord = {
      kind: 'attempt',
      attemptId: uuid(),
      sessionId: this.sessionId,
      levelId,
      world: e.level.world,
      mode: e.mode,
      attemptNo: n,
      isReplay: e.replay,
      startAt: 0,
      firstDragMs: null,
      durationMs: 0,
      activeMs: 0,
      idleMs: 0,
      outcome: null,
      stars: null,
      parMs: e.level.parTime * 1000,
      startIou: r2(e.startIou),
      threshold: e.level.threshold,
      finalIou: r2(e.startIou),
      peakIou: r2(e.startIou),
      peakAtMs: 0,
      iouTrace: [],
      stuckMs: 0,
      nearMissMs: 0,
      drags: 0,
      rotationDeg: 0,
      axisSplit: { x: 0, y: 0, roll: 0 },
      switches: 0,
      lampMoves: 0,
      lampMs: 0,
      hints: [],
      hintPanelOpens: [],
      promptsShown: [],
      pauses: [],
      bulbsBefore: e.bulbs,
      bulbsAfter: e.bulbs,
      winAction: null,
      winScreenMs: null,
    };
    if (e.mode === 'daily') Object.assign(rec, { dailyNo: e.dailyNo, streak: e.streak ?? 0, shared: false });
    if (e.mode === 'endless') Object.assign(rec, { score: 0, solves: 0, multiplierMax: 1, continueUsed: false, targetsSeen: 1, solveMs: [] });
    this.live = {
      rec,
      t: 0,
      started: false,
      solved: false,
      solvedAt: 0,
      endlessOver: false,
      anchor: e.startIou,
      stretchStart: 0,
      nextTrace: 0,
      lastInput: now(),
      lamp: null,
      lampMoving: false,
      lampStill: 0,
      pauseFrom: null,
      pauseAtMs: 0,
      iou: e.startIou,
      hintDue: [],
      panelOpen: null,
      firstHintMeasured: false,
      switchMeasured: false,
      lampMeasured: false,
      hintButton: e.hintButton,
    };
    // Layer A start events wait for the first playing frame (a level built behind the menu may never be played).
  }

  /** First frame the attempt actually plays: Layer A start events. */
  private firstRun(l: Live) {
    l.started = true;
    l.rec.startAt = ms(now());
    l.lastInput = now();
    const id = this.measureId(l);
    if (l.rec.mode === 'campaign') {
      this.measure('level', id, 'start');
      if (!this.worldsSeen.has(l.rec.world)) {
        this.worldsSeen.add(l.rec.world);
        this.measure('world', String(l.rec.world), 'start');
      }
      const idx = Number(id.split('-')[0]) * 100 + Number(id.split('-')[1]);
      if (idx > this.furthest) {
        this.furthest = idx;
        this.session.furthestLevel = id;
      }
    } else if (l.rec.mode === 'daily') this.measure('daily', 'puzzle', 'start');
    else this.measure('endless', 'run', 'start');
    if (l.hintButton) this.measure('button', 'hint', 'visible');
  }

  private tick(e: Extract<AnalyticsEvent, { type: 'tick' }>) {
    const l = this.live;
    if (!l || l.solved) return;
    if (!l.started) {
      if (!e.running) return;
      this.firstRun(l);
    }
    const wall = now();
    // Pauses: any suspension mid-attempt (pause menu, hint panel, level grid, an ad, a hidden tab).
    if (e.suspended) {
      if (l.pauseFrom === null) {
        l.pauseFrom = wall;
        l.pauseAtMs = l.t;
      }
    } else if (l.pauseFrom !== null) {
      l.rec.pauses.push({ atMs: ms(l.pauseAtMs), durMs: ms(wall - l.pauseFrom) });
      l.pauseFrom = null;
    }
    if (!e.running) return;

    const dtMs = e.dt * 1000;
    l.t += dtMs;
    // A held drag or key counts as input for the idle cutoff.
    if (e.busy) l.lastInput = wall;
    l.iou = e.iou;
    const rec = l.rec;
    if (wall - l.lastInput < IDLE_AFTER_MS) rec.activeMs += dtMs;
    else rec.idleMs += dtMs;

    if (e.iou > rec.peakIou) {
      rec.peakIou = r2(e.iou);
      rec.peakAtMs = ms(l.t);
    }
    // stuckMs: longest stretch without a +0.03 gain over the last level that counted as progress.
    if (e.iou >= l.anchor + STUCK_GAIN) {
      l.anchor = e.iou;
      l.stretchStart = l.t;
    }
    rec.stuckMs = Math.max(rec.stuckMs, ms(l.t - l.stretchStart));
    if (e.iou >= NEAR_MISS_FROM && e.iou < rec.threshold) rec.nearMissMs += dtMs;
    if (l.t >= l.nextTrace && rec.iouTrace.length < TRACE_MAX) {
      rec.iouTrace.push([ms(l.nextTrace), r2(e.iou)]);
      l.nextTrace += TRACE_EVERY_MS;
    }
    for (const d of l.hintDue) if (l.t >= d.at) d.hint.iouAfter = r2(e.iou);
    l.hintDue = l.hintDue.filter((d) => d.hint.iouAfter === null);

    // Lamp: time it is moving, and how many separate moves (a pause of 0.25 s starts a new one).
    if (e.lamp) {
      const moved = l.lamp !== null && (Math.abs(e.lamp.yaw - l.lamp.yaw) > 1e-3 || Math.abs(e.lamp.pitch - l.lamp.pitch) > 1e-3);
      if (moved) {
        rec.lampMs += dtMs;
        if (!l.lampMoving) {
          rec.lampMoves++;
          if (!l.lampMeasured) {
            l.lampMeasured = true;
            this.measure('lamp', this.measureId(l), 'moved');
          }
        }
        l.lampMoving = true;
        l.lampStill = 0;
      } else if ((l.lampStill += dtMs) > 250) l.lampMoving = false;
      l.lamp = { ...e.lamp };
    }
  }

  private input(e: Extract<AnalyticsEvent, { type: 'input' | 'drag' }>) {
    if (this.session.firstInputMs === null) this.session.firstInputMs = ms(now());
    const l = this.live;
    if (!l?.started || l.solved) return;
    l.lastInput = now();
    if (l.rec.firstDragMs === null) {
      l.rec.firstDragMs = ms(l.t);
      this.milestone('first-drag');
    }
    if (e.type === 'drag') {
      const a = l.rec.axisSplit;
      a.x += Math.abs(e.pitch);
      a.y += Math.abs(e.yaw);
      a.roll += Math.abs(e.roll);
      l.rec.rotationDeg += Math.abs(e.pitch) + Math.abs(e.yaw) + Math.abs(e.roll);
    } else if (e.kind === 'grab') l.rec.drags++;
  }

  private hint(tier: HintTier, paid: 'free' | 'bulb' | 'ad') {
    const l = this.live;
    if (!l) return;
    const h: HintRec = { tier, atMs: ms(l.t), iouBefore: r2(l.iou), iouAfter: null, paid };
    l.rec.hints.push(h);
    l.hintDue.push({ hint: h, at: l.t + HINT_EFFECT_MS });
    if (l.panelOpen) l.panelOpen.closedWithoutUse = false;
    const id = this.measureId(l);
    this.measure('hint', tier, 'used');
    this.measure('hint-level', id, 'used');
    if (!l.firstHintMeasured) {
      l.firstHintMeasured = true;
      this.measure('hint-time', id, timeBucket(l.t / 1000));
    }
  }

  private solved(e: Extract<AnalyticsEvent, { type: 'solved' }>) {
    const l = this.live;
    if (!l || l.solved) return;
    l.solved = true;
    l.solvedAt = now();
    const rec = l.rec;
    rec.outcome = 'solved';
    rec.stars = e.stars;
    rec.bulbsAfter = e.bulbs;
    rec.durationMs = ms(e.timeS * 1000);
    rec.finalIou = r2(Math.max(l.iou, rec.threshold));
    this.session.levelsSolved++;
    const id = this.measureId(l);
    if (rec.mode === 'campaign') {
      this.measure('level', id, 'complete');
      this.measure('solve-time', id, timeBucket(e.timeS));
      this.measure('stars', id, String(e.stars));
    } else if (rec.mode === 'daily') this.measure('daily', 'puzzle', 'complete');
    this.milestone('first-solve');
  }

  /** Close the open attempt: Layer A quit/fail events, the A+ line, the B record. */
  private endAttempt(outcome: Outcome) {
    const l = this.live;
    if (!l) return;
    this.live = null;
    if (!l.started) return; // built behind the menu, never played
    this.lastLevelId = l.rec.levelId;
    const final: Outcome = l.solved ? 'solved' : l.rec.mode === 'endless' && l.endlessOver ? 'game-over' : outcome;
    const rec = this.finishRecord(l, final);
    const id = this.measureId(l);
    if (rec.mode === 'campaign' && (final === 'quit-menu' || final === 'quit-levels' || final === 'restart')) this.measure('level', id, 'fail');
    if (rec.mode === 'endless') {
      this.measure('endless', 'run', 'fail');
      this.measure('endless-score', 'run', scoreBucket(rec.score ?? 0));
    }
    this.summary(rec);
    this.emit(rec, true);
  }

  /** The record as it stands, closed with `outcome` (open pause and pending hint effects resolved). */
  private finishRecord(l: Live, outcome: Outcome): AttemptRecord {
    const rec = structuredClone(l.rec);
    rec.outcome = outcome;
    if (!l.solved) {
      rec.durationMs = ms(l.t);
      rec.finalIou = r2(l.iou);
    }
    if (l.pauseFrom !== null) rec.pauses.push({ atMs: ms(l.pauseAtMs), durMs: ms(now() - l.pauseFrom) });
    for (const h of rec.hints) if (h.iouAfter === null) h.iouAfter = r2(l.iou);
    rec.activeMs = ms(rec.activeMs);
    rec.idleMs = ms(rec.idleMs);
    rec.nearMissMs = ms(rec.nearMissMs);
    rec.lampMs = ms(rec.lampMs);
    rec.rotationDeg = ms(rec.rotationDeg);
    const sum = rec.axisSplit.x + rec.axisSplit.y + rec.axisSplit.roll;
    rec.axisSplit = sum > 0 ? { x: r2(rec.axisSplit.x / sum), y: r2(rec.axisSplit.y / sum), roll: r2(rec.axisSplit.roll / sum) } : { x: 0, y: 0, roll: 0 };
    return rec;
  }

  /** Layer A+: `[casted] 1-07 solved 48.2s stars=2 hints=nudge@31s peak=0.93@46s drags=14` */
  private summary(r: AttemptRecord) {
    const hints = r.hints.length ? r.hints.map((h) => `${h.tier}@${Math.round(h.atMs / 1000)}s`).join(',') : '-';
    const extra = r.mode === 'endless' ? ` score=${r.score} solves=${r.solves}` : '';
    const line = `[casted] ${r.levelId} ${r.outcome} ${(r.durationMs / 1000).toFixed(1)}s${r.stars !== null ? ` stars=${r.stars}` : ''} hints=${hints} peak=${r.peakIou.toFixed(2)}@${Math.round(r.peakAtMs / 1000)}s drags=${r.drags}${extra}`;
    this.summaries.push(line);
    console.info(line);
  }

  // --- ad offers -------------------------------------------------------------------------------------

  private offer(e: Extract<AnalyticsEvent, { type: 'offer' }>) {
    const levelId = this.live ? this.live.rec.levelId : this.lastLevelId;
    if (e.action === 'visible') {
      // One record per offer on screen; showing the same placement again replaces the unpressed one.
      this.offers = this.offers.filter((o) => o.placement !== e.placement || o.accepted);
      this.offers.push({ kind: 'ad', sessionId: this.sessionId, placement: e.placement, levelId, atMs: ms(now()), shown: true, accepted: false, result: null, durMs: null });
      this.measure('rewarded', e.placement, 'visible');
      return;
    }
    let o = this.offers.find((x) => x.placement === e.placement && x.result === null);
    if (!o) {
      o = { kind: 'ad', sessionId: this.sessionId, placement: e.placement, levelId, atMs: ms(now()), shown: true, accepted: false, result: null, durMs: null };
      this.offers.push(o);
    }
    if (e.action === 'interact') {
      o.accepted = true;
      this.measure('rewarded', e.placement, 'interact');
      return;
    }
    o.accepted = true;
    o.result = e.result;
    o.durMs = ms(e.durMs);
    this.offers = this.offers.filter((x) => x !== o);
    this.emit(o);
  }

  /** Offers that were shown and never pressed. */
  private flushOffers() {
    this.closingOffers = false;
    const keep: AdRecord[] = [];
    for (const o of this.offers) {
      if (o.accepted) keep.push(o);
      else this.emit(o);
    }
    this.offers = keep;
  }
}
