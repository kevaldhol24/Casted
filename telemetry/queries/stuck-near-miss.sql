-- Per level: median stuckMs (longest stretch without a +0.03 match gain) and median nearMissMs (time spent between
-- 0.75 and the threshold), in seconds, over every campaign attempt. High near-miss = threshold too strict?
WITH s AS (
  SELECT level_id, stuck_ms, near_miss_ms,
         ROW_NUMBER() OVER (PARTITION BY level_id ORDER BY stuck_ms)     AS rn_stuck,
         ROW_NUMBER() OVER (PARTITION BY level_id ORDER BY near_miss_ms) AS rn_near,
         COUNT(*)     OVER (PARTITION BY level_id) AS n
  FROM attempts
  WHERE mode = 'campaign'
)
SELECT level_id,
       n AS attempts,
       ROUND(MIN(CASE WHEN rn_stuck >= 0.5 * n THEN stuck_ms END) / 1000.0, 1)    AS median_stuck_s,
       ROUND(MIN(CASE WHEN rn_near  >= 0.5 * n THEN near_miss_ms END) / 1000.0, 1) AS median_near_miss_s
FROM s
GROUP BY level_id
ORDER BY level_id;
