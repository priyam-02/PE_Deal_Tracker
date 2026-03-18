import Database from "better-sqlite3";
import { resolve } from "path";

const DB_PATH = resolve(process.cwd(), "deals.db");

class DealStore {
  constructor(logger) {
    this.log = logger;
    this.db = new Database(DB_PATH);
    this.db.pragma("journal_mode = WAL");
    this._migrate();
  }

  _migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS seen_articles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source      TEXT NOT NULL,
        url         TEXT NOT NULL UNIQUE,
        title       TEXT,
        fetched_at  TEXT DEFAULT (datetime('now'))
      );

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

      CREATE INDEX IF NOT EXISTS idx_seen_url ON seen_articles(url);
      CREATE INDEX IF NOT EXISTS idx_deals_notified ON deals(notified);
    `);
    this.log.info("Database initialized at", DB_PATH);
  }

  /** Returns true if this URL has NOT been seen before (i.e. it's new) */
  markSeen(source, url, title) {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO seen_articles (source, url, title) VALUES (?, ?, ?)`
    );
    const result = stmt.run(source, url, title);
    return result.changes > 0; // true = newly inserted = not seen before
  }

  saveDeal(deal) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO deals 
        (article_url, acquirer, target, deal_value, deal_type, sector, pe_firm, expected_close, summary, source, headline, published_at)
      VALUES 
        (@article_url, @acquirer, @target, @deal_value, @deal_type, @sector, @pe_firm, @expected_close, @summary, @source, @headline, @published_at)
    `);
    const result = stmt.run(deal);
    if (result.changes > 0) {
      this.log.info(`💾 Saved deal: ${deal.acquirer} → ${deal.target}`);
    }
    return result.changes > 0;
  }

  getUnnotifiedDeals() {
    return this.db.prepare(`SELECT * FROM deals WHERE notified = 0`).all();
  }

  markNotified(ids) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(
      `UPDATE deals SET notified = 1 WHERE id IN (${placeholders})`
    ).run(...ids);
  }

  getStats() {
    const totalArticles = this.db.prepare("SELECT COUNT(*) as c FROM seen_articles").get().c;
    const totalDeals = this.db.prepare("SELECT COUNT(*) as c FROM deals").get().c;
    const todayDeals = this.db.prepare(
      "SELECT COUNT(*) as c FROM deals WHERE date(created_at) = date('now')"
    ).get().c;
    return { totalArticles, totalDeals, todayDeals };
  }

  close() {
    this.db.close();
  }
}

export default DealStore;
