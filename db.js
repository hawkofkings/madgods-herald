const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function openDatabase(filename) {
  fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      discord_user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      realm TEXT NOT NULL CHECK (realm IN ('mania', 'dementia')),
      assigned_at TEXT NOT NULL,
      event TEXT NOT NULL DEFAULT 'standard'
    );

    CREATE TABLE IF NOT EXISTS greymarch_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );
  `);

  const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
  const setSetting = db.prepare(`
    INSERT INTO settings(key, value) VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  if (!getSetting.get("greymarch_active")) setSetting.run("greymarch_active", "false");

  return db;
}

module.exports = { openDatabase };
