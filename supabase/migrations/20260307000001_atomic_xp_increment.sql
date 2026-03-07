-- Atomic XP increment to prevent race conditions
-- when multiple XP awards fire concurrently
CREATE OR REPLACE FUNCTION increment_user_xp(p_user_id UUID, p_amount INT)
RETURNS INT
LANGUAGE sql
AS $$
  UPDATE users
  SET total_xp = total_xp + p_amount
  WHERE id = p_user_id
  RETURNING total_xp;
$$;
