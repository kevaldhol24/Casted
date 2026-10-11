-- Per level: attempts, quit rate (not solved), explicit quits (Menu / Levels / Restart), hint rate, and the median
-- time to the first hint (seconds, attempts that used one).
WITH h AS (
  SELECT level_id, first_hint_ms,
         ROW_NUMBER() OVER (PARTITION BY level_id ORDER BY first_hint_ms) AS rn,
         COUNT(*)     OVER (PARTITION BY level_id) AS n
  FROM attempts
  WHERE mode = 'campaign' AND first_hint_ms IS NOT NULL
),
first_hint AS (
  SELECT level_id, ROUND(MIN(CASE WHEN rn >= 0.5 * n THEN first_hint_ms END) / 1000.0, 1) AS median_first_hint_s
  FROM h GROUP BY level_id
)
SELECT a.level_id,
       COUNT(*) AS attempts,
       ROUND(100.0 * SUM(a.outcome <> 'solved') / COUNT(*), 1) AS quit_rate_pct,
       ROUND(100.0 * SUM(a.outcome IN ('quit-menu', 'quit-levels', 'restart')) / COUNT(*), 1) AS explicit_quit_pct,
       ROUND(100.0 * SUM(a.hint_count > 0) / COUNT(*), 1) AS hint_rate_pct,
       f.median_first_hint_s
FROM attempts a
LEFT JOIN first_hint f ON f.level_id = a.level_id
WHERE a.mode = 'campaign'
GROUP BY a.level_id
ORDER BY a.level_id;
