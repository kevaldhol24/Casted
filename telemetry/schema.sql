-- Casted telemetry (Analytics Layer B). One row per session, per level attempt, per ad offer.
-- No IP address, user agent string or any personal data is stored: ids are random UUIDs made by the game.
-- received_at = server time (ms) the row was last written; the daily cron deletes rows older than RETENTION_DAYS.

CREATE TABLE IF NOT EXISTS sessions (
  session_id       TEXT PRIMARY KEY,
  player_id        TEXT NOT NULL,
  build            TEXT NOT NULL,
  first_visit      INTEGER NOT NULL,
  days_since_first INTEGER NOT NULL,
  device           TEXT NOT NULL,
  os               TEXT NOT NULL,
  browser          TEXT NOT NULL,
  viewport         TEXT NOT NULL,
  dpr              REAL NOT NULL,
  tier             TEXT NOT NULL,
  lang             TEXT NOT NULL,
  tz_offset        INTEGER NOT NULL,
  load_ms          INTEGER,
  first_input_ms   INTEGER,
  end_ms           INTEGER,
  end_reason       TEXT,
  levels_solved    INTEGER NOT NULL,
  furthest_level   TEXT,
  received_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id);
CREATE INDEX IF NOT EXISTS sessions_received ON sessions (received_at);

-- The game may send an attempt more than once (a snapshot when the tab is hidden, then the real end); the
-- Worker keeps the version with the longest duration_ms.
CREATE TABLE IF NOT EXISTS attempts (
  attempt_id        TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  level_id          TEXT NOT NULL,
  world             INTEGER NOT NULL,
  mode              TEXT NOT NULL,
  attempt_no        INTEGER NOT NULL,
  is_replay         INTEGER NOT NULL,
  start_at          INTEGER NOT NULL,
  first_drag_ms     INTEGER,
  duration_ms       INTEGER NOT NULL,
  active_ms         INTEGER NOT NULL,
  idle_ms           INTEGER NOT NULL,
  outcome           TEXT NOT NULL,
  stars             INTEGER,
  par_ms            INTEGER NOT NULL,
  start_iou         REAL NOT NULL,
  threshold         REAL NOT NULL,
  final_iou         REAL NOT NULL,
  peak_iou          REAL NOT NULL,
  peak_at_ms        INTEGER NOT NULL,
  stuck_ms          INTEGER NOT NULL,
  near_miss_ms      INTEGER NOT NULL,
  drags             INTEGER NOT NULL,
  rotation_deg      INTEGER NOT NULL,
  axis_x            REAL NOT NULL,
  axis_y            REAL NOT NULL,
  axis_roll         REAL NOT NULL,
  switches          INTEGER NOT NULL,
  lamp_moves        INTEGER NOT NULL,
  lamp_ms           INTEGER NOT NULL,
  hint_count        INTEGER NOT NULL,
  first_hint_ms     INTEGER,
  hint_panel_opens  INTEGER NOT NULL,
  bulbs_before      INTEGER NOT NULL,
  bulbs_after       INTEGER NOT NULL,
  win_action        TEXT,
  win_screen_ms     INTEGER,
  -- JSON: [[ms, iou], …] every 2 s; [{tier, atMs, iouBefore, iouAfter, paid}]; [{atMs, closedWithoutUse}];
  -- [{type, atMs}]; [{atMs, durMs}]; Daily {dailyNo, streak, shared} / Endless {score, solves, …} extras
  iou_trace         TEXT NOT NULL,
  hints             TEXT NOT NULL,
  hint_panels       TEXT NOT NULL,
  prompts           TEXT NOT NULL,
  pauses            TEXT NOT NULL,
  extras            TEXT,
  received_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_level ON attempts (level_id, outcome);
CREATE INDEX IF NOT EXISTS attempts_session ON attempts (session_id);
CREATE INDEX IF NOT EXISTS attempts_received ON attempts (received_at);

CREATE TABLE IF NOT EXISTS ad_offers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  placement    TEXT NOT NULL,
  level_id     TEXT,
  at_ms        INTEGER NOT NULL,
  shown        INTEGER NOT NULL,
  accepted     INTEGER NOT NULL,
  result       TEXT,
  dur_ms       INTEGER,
  received_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_offers_placement ON ad_offers (placement);
CREATE INDEX IF NOT EXISTS ad_offers_received ON ad_offers (received_at);
