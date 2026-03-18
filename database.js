import initSqlJs from "sql.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const DB_PATH = resolve(process.cwd(), "deals.db");

class DealStore {
  constructor(logger) {
    this.log = logger;
    this.db = null;
    this._ready = this._init();
  }

  async _init() {
    const SQL = await initSqlJs();
    if (existsSync(DB_PATH)) {
      const buf = readFileSync(DB_PATH);
      this.db = new SQL.Database(buf);
    } else {
      this.db = new SQL.Database();
    }
    this._migrate();
  }

  async ready() {
    await this._ready;
  }

  _save() {
    const data = this.db.export();
    writeFileSync(DB_PATH, Buffer.from(data));
  }

  _migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS seen_articles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source      TEXT NOT NULL,
        url         TEXT NOT NULL UNIQUE,
        title       TEXT,
        fetched_at  TEXT DEFAULT (datetime('now'))
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS deals (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        article_url     TEXT NOT NULL UNIQUE,
        acquirer        TEXT,
        target          TEXT,
        deal_value      TEXT,
        deal_type       TEXT,
        sector          TEXT,
        pe_firm         TEXT,
        expected_close  TEXT,
        summary         TEXT,
        source          TEXT,
        headline        TEXT,
        published_at    TEXT,
        created_at      TEXT DEFAULT (datetime('now')),
        notified        INTEGER DEFAULT 0
      );
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_seen_url ON seen_articles(url);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_deals_notified ON deals(notified);`);
    this._save();
    this.log.info("Database initialized at", DB_PATH);
  }

  /** Returns true if this URL has NOT been seen before (i.e. it's new) */
  markSeen(source, url, title) {
    const existing = this.db.exec("SELECT 1 FROM seen_articles WHERE url = ?", [url]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return false;
    }
    this.db.run("INSERT OR IGNORE INTO seen_articles (source, url, title) VALUES (?, ?, ?)", [source, url, title]);
    this._save();
    return true;
  }

  saveDeal(deal) {
    const existing = this.db.exec("SELECT 1 FROM deals WHERE article_url = ?", [deal.article_url]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return false;
    }
    this.db.run(
      `INSERT OR IGNORE INTO deals
        (article_url, acquirer, target, deal_value, deal_type, sector, pe_firm, expected_close, summary, source, headline, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [deal.article_url, deal.acquirer, deal.target, deal.deal_value, deal.deal_type, deal.sector, deal.pe_firm, deal.expected_close, deal.summary, deal.source, deal.headline, deal.published_at]
    );
    const changes = this.db.getRowsModified();
    if (changes > 0) {
      this.log.info(`💾 Saved deal: ${deal.acquirer} → ${deal.target}`);
    }
    this._save();
    return changes > 0;
  }

  getUnnotifiedDeals() {
    const result = this.db.exec("SELECT * FROM deals WHERE notified = 0");
    if (result.length === 0) return [];
    const cols = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  markNotified(ids) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db.run(`UPDATE deals SET notified = 1 WHERE id IN (${placeholders})`, ids);
    this._save();
  }

  getStats() {
    const totalArticles = this.db.exec("SELECT COUNT(*) as c FROM seen_articles")[0]?.values[0][0] || 0;
    const totalDeals = this.db.exec("SELECT COUNT(*) as c FROM deals")[0]?.values[0][0] || 0;
    const todayDeals = this.db.exec("SELECT COUNT(*) as c FROM deals WHERE date(created_at) = date('now')")[0]?.values[0][0] || 0;
    return { totalArticles, totalDeals, todayDeals };
  }

  close() {
    this._save();
    this.db.close();
  }
}

export default DealStore;
