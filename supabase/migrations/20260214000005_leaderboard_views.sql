-- US-040: Materialized views for weekly leaderboard categories
-- Refreshed every 15 minutes via pg_cron
-- ===========================================================

-- ── Top Score (highest single session score this week) ───────
CREATE MATERIALIZED VIEW leaderboard_top_score AS
SELECT
  s.user_id,
  s.org_id,
  u.name AS user_name,
  MAX(sc.overall_score) AS top_score,
  COUNT(sc.id) AS sessions_this_week,
  RANK() OVER (PARTITION BY s.org_id ORDER BY MAX(sc.overall_score) DESC) AS rank
FROM sessions s
JOIN scorecards sc ON sc.session_id = s.id
JOIN users u ON u.id = s.user_id
WHERE s.started_at >= date_trunc('week', now())
GROUP BY s.user_id, s.org_id, u.name;

CREATE UNIQUE INDEX idx_lb_top_score ON leaderboard_top_score (org_id, user_id);

-- ── Most Improved (current week avg - previous week avg) ────
CREATE MATERIALIZED VIEW leaderboard_most_improved AS
WITH current_week AS (
  SELECT s.user_id, s.org_id, AVG(sc.overall_score) AS avg_score
  FROM sessions s
  JOIN scorecards sc ON sc.session_id = s.id
  WHERE s.started_at >= date_trunc('week', now())
  GROUP BY s.user_id, s.org_id
),
prev_week AS (
  SELECT s.user_id, s.org_id, AVG(sc.overall_score) AS avg_score
  FROM sessions s
  JOIN scorecards sc ON sc.session_id = s.id
  WHERE s.started_at >= date_trunc('week', now()) - interval '7 days'
    AND s.started_at < date_trunc('week', now())
  GROUP BY s.user_id, s.org_id
)
SELECT
  cw.user_id,
  cw.org_id,
  u.name AS user_name,
  ROUND(cw.avg_score - COALESCE(pw.avg_score, cw.avg_score))::int AS improvement,
  ROUND(cw.avg_score)::int AS current_avg,
  ROUND(COALESCE(pw.avg_score, 0))::int AS prev_avg,
  RANK() OVER (
    PARTITION BY cw.org_id
    ORDER BY (cw.avg_score - COALESCE(pw.avg_score, cw.avg_score)) DESC
  ) AS rank
FROM current_week cw
LEFT JOIN prev_week pw ON pw.user_id = cw.user_id AND pw.org_id = cw.org_id
JOIN users u ON u.id = cw.user_id;

CREATE UNIQUE INDEX idx_lb_most_improved ON leaderboard_most_improved (org_id, user_id);

-- ── Consistency King (lowest score variance, min 3 sessions) ─
CREATE MATERIALIZED VIEW leaderboard_consistency AS
SELECT
  s.user_id,
  s.org_id,
  u.name AS user_name,
  ROUND(STDDEV_POP(sc.overall_score)::numeric, 2) AS score_variance,
  ROUND(AVG(sc.overall_score))::int AS avg_score,
  COUNT(sc.id) AS sessions_count,
  RANK() OVER (
    PARTITION BY s.org_id
    ORDER BY STDDEV_POP(sc.overall_score) ASC
  ) AS rank
FROM sessions s
JOIN scorecards sc ON sc.session_id = s.id
JOIN users u ON u.id = s.user_id
WHERE s.started_at >= date_trunc('week', now())
GROUP BY s.user_id, s.org_id, u.name
HAVING COUNT(sc.id) >= 3;

CREATE UNIQUE INDEX idx_lb_consistency ON leaderboard_consistency (org_id, user_id);

-- ── Streak Leader (consecutive days with sessions) ──────────
CREATE MATERIALIZED VIEW leaderboard_streak AS
WITH daily_sessions AS (
  SELECT
    user_id,
    org_id,
    date_trunc('day', started_at) AS session_day
  FROM sessions
  WHERE status = 'completed'
  GROUP BY user_id, org_id, date_trunc('day', started_at)
),
streaks AS (
  SELECT
    user_id,
    org_id,
    session_day,
    session_day - (ROW_NUMBER() OVER (PARTITION BY user_id, org_id ORDER BY session_day) * interval '1 day') AS streak_group
  FROM daily_sessions
),
streak_lengths AS (
  SELECT
    user_id,
    org_id,
    COUNT(*) AS streak_length,
    MAX(session_day) AS streak_end
  FROM streaks
  GROUP BY user_id, org_id, streak_group
),
current_streaks AS (
  SELECT DISTINCT ON (user_id, org_id)
    user_id,
    org_id,
    streak_length
  FROM streak_lengths
  WHERE streak_end >= date_trunc('day', now()) - interval '1 day'
  ORDER BY user_id, org_id, streak_end DESC
)
SELECT
  cs.user_id,
  cs.org_id,
  u.name AS user_name,
  cs.streak_length AS streak_days,
  RANK() OVER (PARTITION BY cs.org_id ORDER BY cs.streak_length DESC) AS rank
FROM current_streaks cs
JOIN users u ON u.id = cs.user_id;

CREATE UNIQUE INDEX idx_lb_streak ON leaderboard_streak (org_id, user_id);

-- ── pg_cron: refresh every 15 minutes ───────────────────────
-- To enable: go to Supabase Dashboard → Database → Extensions → enable pg_cron
-- Then run this SQL manually in the SQL Editor:
--
-- SELECT cron.schedule(
--   'refresh-leaderboards',
--   '*/15 * * * *',
--   $$
--     REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_top_score;
--     REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_most_improved;
--     REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_consistency;
--     REFRESH MATERIALIZED VIEW CONCURRENTLY leaderboard_streak;
--   $$
-- );
