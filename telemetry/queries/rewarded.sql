-- Rewarded placements: how often an offer on screen is pressed (interact rate) and how often a pressed one paid
-- out (fill rate). Midgame breaks are listed separately: requests and how many actually showed an ad.
SELECT placement,
       COUNT(*) AS offers_shown,
       SUM(accepted) AS pressed,
       ROUND(100.0 * SUM(accepted) / COUNT(*), 1) AS interact_rate_pct,
       ROUND(100.0 * SUM(result = 'rewarded') / NULLIF(SUM(accepted), 0), 1) AS fill_rate_pct
FROM ad_offers
WHERE placement <> 'midgame'
GROUP BY placement
UNION ALL
SELECT 'midgame', COUNT(*), NULL, NULL, ROUND(100.0 * SUM(shown) / COUNT(*), 1)
FROM ad_offers
WHERE placement = 'midgame'
ORDER BY offers_shown DESC;
