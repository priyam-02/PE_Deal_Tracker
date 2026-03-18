import config from "./config.js";
import Logger from "./utils/logger.js";
import DealStore from "./database.js";
import DealNotifier from "./telegram.js";
import { fetchAllFeeds } from "./fetcher.js";
import { analyzeArticles } from "./analyzer.js";

const log = new Logger(config.logLevel);
const store = new DealStore(log);
const notifier = new DealNotifier(log, store);

let isRunning = false;

/**
 * Single poll cycle:
 * 1. Fetch RSS feeds from all 3 wire services
 * 2. Filter out already-seen articles
 * 3. Send new candidates to Nemotron for PE deal classification
 * 4. Save confirmed deals to SQLite
 * 5. Send Telegram notifications
 */
async function pollCycle() {
  if (isRunning) {
    log.warn("Previous poll still running, skipping this cycle");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log.info("🔄 Starting poll cycle...");

    // Step 1: Fetch all RSS feeds
    const candidates = await fetchAllFeeds(config.maxItemsPerSource, log);
    log.info(`📰 ${candidates.length} candidate articles found`);

    if (candidates.length === 0) {
      log.info("No new candidates this cycle");
      return;
    }

    // Step 2: Filter out already-seen articles
    const newArticles = [];
    for (const article of candidates) {
      const isNew = store.markSeen(article.source, article.url, article.title);
      if (isNew) newArticles.push(article);
    }
    log.info(`🆕 ${newArticles.length} new articles to analyze`);

    if (newArticles.length === 0) {
      log.info("All articles already seen, nothing to analyze");
      return;
    }

    // Step 3: Send to Nemotron for analysis
    const deals = await analyzeArticles(newArticles, log);
    log.info(`🤝 ${deals.length} PE deals identified`);

    // Step 4: Save to database
    let saved = 0;
    for (const deal of deals) {
      if (store.saveDeal(deal)) saved++;
    }
    log.info(`💾 ${saved} new deals saved`);

    // Step 5: Send Telegram notifications
    const notified = await notifier.notifyNewDeals();
    log.info(`📨 ${notified} notifications sent`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`✅ Poll cycle complete in ${elapsed}s`);
  } catch (err) {
    log.error("Poll cycle failed:", err.message);
    log.error(err.stack);
  } finally {
    isRunning = false;
  }
}

// ─── Main ───────────────────────────────────────────────────────────

log.info("🚀 PE Deal Tracker starting up...");
log.info(`   Model:    ${config.nim.model}`);
log.info(`   Interval: ${config.pollIntervalMs / 60000} min`);
log.info(`   Sources:  PR Newswire, BusinessWire, GlobeNewsWire`);
log.info(`   Chat ID:  ${config.telegram.chatId}`);
log.info("");

// Run first cycle immediately
pollCycle();

// Then poll on interval
const interval = setInterval(pollCycle, config.pollIntervalMs);

// Graceful shutdown
function shutdown(signal) {
  log.info(`\n${signal} received, shutting down...`);
  clearInterval(interval);
  notifier.stop();
  store.close();
  log.info("Goodbye! 👋");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
