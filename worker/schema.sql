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
  created TEXT NOT NULL DEFAULT (datetime('now'))
);
