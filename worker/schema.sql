-- Shared food library. One row per food; name is unique case-insensitively so
-- republishing the same name fixes/overwrites the earlier values.
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_lc TEXT NOT NULL UNIQUE,
  serving TEXT NOT NULL DEFAULT '100 g',
  kcal REAL NOT NULL,
  p REAL NOT NULL DEFAULT 0,
  c REAL NOT NULL DEFAULT 0,
  f REAL NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL DEFAULT '',
  -- Opaque per-install id of whoever published the row. Only that install can
  -- edit or delete it; rows predating this column ('') stay editable by any
  -- key holder so nothing is orphaned.
  owner TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily snapshots of the whole foods table (written by the cron trigger in
-- src/index.js) so a bad delete is recoverable. Kept to the last 14.
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  rows INTEGER NOT NULL,
  data TEXT NOT NULL
);
