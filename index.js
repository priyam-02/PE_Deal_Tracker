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
 * Core scan logic — fetches feeds, dedup, analyze, save.
 * Returns { candidates, newArticles, deals } for on-demand use.
 */
async function scanFeeds() {
  // Step 1: Fetch all RSS feeds
  const candidates = await fetchAllFeeds(config.maxItemsPerSource, log);
  log.info(`📰 ${candidates.length} candidate articles found`);

  if (candidates.length === 0) {
    return { candidates: 0, newArticles: 0, deals: [] };
  }

  // Step 2: Filter out already-seen articles
  const newArticles = [];
  for (const article of candidates) {
    const isNew = store.markSeen(article.source, article.url, article.title);
    if (isNew) newArticles.push(article);
  }
  log.info(`🆕 ${newArticles.length} new articles to analyze`);

  if (newArticles.length === 0) {
    return { candidates: candidates.length, newArticles: 0, deals: [] };
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

  return { candidates: candidates.length, newArticles: newArticles.length, deals };
}

/**
 * Scheduled poll cycle — runs scanFeeds + sends notifications.
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

    await scanFeeds();

    // Send Telegram notifications for any unnotified deals
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

// Register on-demand /fetch handler
notifier.onFetch(async (chatId) => {
  log.info(`📲 On-demand fetch triggered by chat ${chatId}`);
  const result = await scanFeeds();

  // Mark any new deals as notified since we're sending them directly
  if (result.deals.length > 0) {
    const unnotified = store.getUnnotifiedDeals();
    const ids = unnotified.map((d) => d.id);
    store.markNotified(ids);
  }

  return result;
});

// ─── Main ───────────────────────────────────────────────────────────

log.info("🚀 PE Deal Tracker starting up...");
log.info(`   Model:    ${config.nim.model}`);
log.info(`   Interval: ${config.pollIntervalMs / 60000} min`);
log.info(`   Sources:  PR Newswire, BusinessWire, GlobeNewsWire`);
log.info(`   Chat ID:  ${config.telegram.chatId}`);
log.info("");

// Wait for async DB init before starting
await store.ready();

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
