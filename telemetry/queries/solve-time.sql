-- Per-level solve time: solves, median and 75th percentile (seconds), campaign first tries and replays together.
-- Nearest-rank percentiles (SQLite has no MEDIAN): the smallest value whose rank reaches p × n.
WITH s AS (
  SELECT level_id, duration_ms,
         ROW_NUMBER() OVER (PARTITION BY level_id ORDER BY duration_ms) AS rn,
         COUNT(*)     OVER (PARTITION BY level_id) AS n
  FROM attempts
  WHERE mode = 'campaign' AND outcome = 'solved'
)
SELECT level_id,
       n AS solves,
       ROUND(MIN(CASE WHEN rn >= 0.50 * n THEN duration_ms END) / 1000.0, 1) AS median_s,
       ROUND(MIN(CASE WHEN rn >= 0.75 * n THEN duration_ms END) / 1000.0, 1) AS p75_s
FROM s
GROUP BY level_id
ORDER BY level_id;
