// Co so du lieu SQLite (1 file, mien phi, khong can tai khoan/premium). Luu lich su su kien, CID, ma bam,
// trang thai va chu ky so cua tung van bang -> luon con du lieu du RPC cong khai xoa log cu ("pruned").
// Blockchain van la NGUON SU THAT; DB chi la ban sao duoc dong bo tu chuoi (xem indexer.js).
let Database;
try {
  Database = require("better-sqlite3");
} catch {
  const { DatabaseSync } = require("node:sqlite");
  Database = class extends DatabaseSync {
    constructor(path, options) {
      if (options) super(path, options);
      else super(path);
    }
    pragma(str) {
      return this.exec("PRAGMA " + str);
    }
    transaction(fn) {
      return (...args) => {
        this.exec("BEGIN");
        try {
          const res = fn(...args);
          this.exec("COMMIT");
          return res;
        } catch (err) {
          this.exec("ROLLBACK");
          throw err;
        }
      };
    }
  };
}
const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "diploma.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS diplomas (
  diploma_id TEXT PRIMARY KEY, file_hash TEXT, cid TEXT, issuer TEXT,
  issued_at INTEGER, updated_at INTEGER, status INTEGER,
  sign_message TEXT, signature TEXT, signed_at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, diploma_id TEXT NOT NULL, kind TEXT NOT NULL,
  tx_hash TEXT NOT NULL, block_number INTEGER NOT NULL, log_index INTEGER NOT NULL,
  ts INTEGER, actor TEXT, file_hash TEXT, cid TEXT, reason TEXT,
  UNIQUE (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_events_diploma ON events (diploma_id, block_number, log_index);
`);

const q = {
  getMeta: db.prepare("SELECT value FROM meta WHERE key = ?"),
  setMeta: db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
  insEvent: db.prepare(`INSERT OR IGNORE INTO events (diploma_id, kind, tx_hash, block_number, log_index, ts, actor, file_hash, cid, reason)
                        VALUES (@diploma_id, @kind, @tx_hash, @block_number, @log_index, @ts, @actor, @file_hash, @cid, @reason)`),
  getDiploma: db.prepare("SELECT * FROM diplomas WHERE diploma_id = ?"),
  upsertDiploma: db.prepare(`INSERT INTO diplomas (diploma_id, file_hash, cid, issuer, issued_at, updated_at, status)
                             VALUES (@diploma_id, @file_hash, @cid, @issuer, @issued_at, @updated_at, @status)
                             ON CONFLICT(diploma_id) DO UPDATE SET file_hash=excluded.file_hash, cid=excluded.cid,
                             issuer=excluded.issuer, issued_at=excluded.issued_at, updated_at=excluded.updated_at, status=excluded.status`),
  setSignature: db.prepare("UPDATE diplomas SET sign_message=?, signature=?, signed_at=? WHERE diploma_id=?"),
  history: db.prepare("SELECT kind, tx_hash, block_number, log_index, ts, actor, file_hash, cid, reason FROM events WHERE diploma_id = ? ORDER BY block_number, log_index"),
  list: db.prepare("SELECT diploma_id, file_hash, cid, issuer, issued_at, status FROM diplomas ORDER BY issued_at, diploma_id LIMIT ? OFFSET ?"),
  stats: db.prepare("SELECT COUNT(*) AS total, SUM(status = 1) AS valid, SUM(status = 2) AS revoked FROM diplomas"),
};
const getMeta = (k) => (q.getMeta.get(k) || {}).value ?? null;
const setMeta = (k, v) => q.setMeta.run(k, String(v));
function reset() { db.exec("DELETE FROM events; DELETE FROM diplomas; DELETE FROM meta;"); }

module.exports = { db, q, getMeta, setMeta, reset, DB_PATH };
