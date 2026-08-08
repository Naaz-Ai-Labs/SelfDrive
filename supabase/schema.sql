p  entity_id BIGINT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
);

-- 38. Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (to_char(now(), 'YYYY-MM-DD HH24:MI:SS'))
);
