-- db/migrations/002_auth.sql
-- Authentication: sessions, login lockout, role permissions.

BEGIN;

ALTER TABLE users
  ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until       timestamptz;

CREATE TABLE sessions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text   NOT NULL UNIQUE,       -- SHA-256 of the cookie token
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text
);
CREATE INDEX ix_sessions_user    ON sessions(user_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);

-- Permissions per role
UPDATE roles SET permissions = '["*"]'
 WHERE name = 'admin';

UPDATE roles SET permissions =
  '["accounts.read","entries.read","entries.write","entries.post","entries.reverse","reports.read"]'
 WHERE name = 'accountant';

UPDATE roles SET permissions =
  '["accounts.read","entries.read","reports.read"]'
 WHERE name = 'viewer';

-- The temporary development user can no longer log in.
-- (It stays in the table because test entries reference it.)
UPDATE users SET is_active = false, password_hash = '!'
 WHERE username = 'test';

COMMIT;