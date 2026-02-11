ALTER TABLE waves
  ADD COLUMN ignored_at timestamptz,
  ADD COLUMN ignore_cooldown_until timestamptz;