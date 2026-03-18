import TelegramBot from "node-telegram-bot-api";
import config from "./config.js";

class DealNotifier {
  constructor(logger, dealStore) {
    this.log = logger;
    this.store = dealStore;
    this.bot = new TelegramBot(config.telegram.token, { polling: true });
    this._onFetch = null; // callback set by index.js
    this._registerCommands();
  }

  /** Register an on-demand fetch handler (called from index.js) */
  onFetch(callback) {
    this._onFetch = callback;
  }

  _registerCommands() {
    // /start — welcome message
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.bot.sendMessage(
        chatId,
        `🤝 *PE Deal Tracker Bot*\n\n` +
          `I monitor press releases from PR Newswire, BusinessWire, and GlobeNewsWire ` +
          `for Private Equity M&A activity.\n\n` +
          `*Commands:*\n` +
          `/fetch — Scan all feeds now and send new deals\n` +
          `/status — Bot status and stats\n` +
          `/recent — Last 5 deals found\n` +
          `/chatid — Show your chat ID\n\n` +
          `I'll also send you alerts automatically every ${config.pollIntervalMs / 60000} minutes.`,
        { parse_mode: "Markdown" }
      );
    });

    // /fetch — on-demand scan
    this.bot.onText(/\/fetch/, async (msg) => {
      const chatId = msg.chat.id;

      if (!this._onFetch) {
        this.bot.sendMessage(chatId, "Fetch handler not ready yet. Try again in a moment.");
        return;
      }

      this.bot.sendMessage(chatId, "🔍 Scanning all wire services now... this may take a minute.");

      try {
        const result = await this._onFetch(chatId);
        const { candidates, newArticles, deals } = result;

        let summary = `✅ *Scan Complete*\n\n`;
        summary += `📰 Candidate articles found: ${candidates}\n`;
        summary += `🆕 New articles analyzed: ${newArticles}\n`;
        summary += `🤝 PE deals identified: ${deals.length}\n`;

        if (deals.length === 0) {
          summary += `\n_No new PE deals found in this scan._`;
          this.bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
        } else {
          this.bot.sendMessage(chatId, summary, { parse_mode: "Markdown" });
          for (const deal of deals) {
            await this._sendDealMessage(chatId, deal);
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      } catch (err) {
        this.log.error("Fetch command failed:", err.message);
        this.bot.sendMessage(chatId, `❌ Scan failed: ${err.message}`);
      }
    });

    // /chatid — helpful for setup
    this.bot.onText(/\/chatid/, (msg) => {
      this.bot.sendMessage(msg.chat.id, `Your chat ID is: \`${msg.chat.id}\``, {
        parse_mode: "Markdown",
      });
    });

    // /status — show stats
    this.bot.onText(/\/status/, (msg) => {
      const stats = this.store.getStats();
      this.bot.sendMessage(
        msg.chat.id,
        `📊 *Deal Tracker Status*\n\n` +
          `Articles scanned: ${stats.totalArticles}\n` +
          `PE deals found: ${stats.totalDeals}\n` +
          `Deals today: ${stats.todayDeals}\n` +
          `Polling interval: ${config.pollIntervalMs / 60000} min`,
        { parse_mode: "Markdown" }
      );
    });

    // /recent — last 5 deals
    this.bot.onText(/\/recent/, (msg) => {
      try {
        const result = this.store.db.exec("SELECT * FROM deals ORDER BY created_at DESC LIMIT 5");

        if (result.length === 0 || result[0].values.length === 0) {
          this.bot.sendMessage(msg.chat.id, "No deals found yet. Try /fetch to scan now.");
          return;
        }

        const cols = result[0].columns;
        const deals = result[0].values.map(row => {
          const obj = {};
          cols.forEach((col, i) => { obj[col] = row[i]; });
          return obj;
        });

        for (const deal of deals) {
          this._sendDealMessage(msg.chat.id, deal);
        }
      } catch (err) {
        this.log.error("Error fetching recent deals:", err.message);
        this.bot.sendMessage(msg.chat.id, "Error fetching recent deals.");
      }
    });

    this.log.info("🤖 Telegram bot commands registered");
  }

  /**
   * Send a formatted deal alert to a specific chat.
   */
  _sendDealMessage(chatId, deal) {
    const dealTypeEmoji = {
      acquisition: "🏷️",
      merger: "🤝",
      lbo: "💰",
      "take-private": "🔒",
      "bolt-on": "🔩",
      "add-on": "➕",
      "carve-out": "✂️",
      recapitalization: "🔄",
      divestiture: "📤",
      other: "📋",
    };

    const emoji = dealTypeEmoji[deal.deal_type] || "📋";
    const dealType = deal.deal_type
      ? deal.deal_type.charAt(0).toUpperCase() + deal.deal_type.slice(1)
      : "Acquisition";

    let message = `🚨 *PE Deal Alert*\n\n`;
    message += `${emoji} *Type:* ${dealType}\n`;

    if (deal.pe_firm) {
      message += `🏦 *PE Firm:* ${deal.pe_firm}\n`;
    }
    message += `🏢 *Acquirer:* ${deal.acquirer}\n`;
    message += `🎯 *Target:* ${deal.target}\n`;

    if (deal.deal_value) {
      message += `💵 *Value:* ${deal.deal_value}\n`;
    }
    if (deal.sector) {
      message += `🏭 *Sector:* ${deal.sector}\n`;
    }
    if (deal.expected_close) {
      message += `📅 *Expected Close:* ${deal.expected_close}\n`;
    }

    message += `\n📰 *Source:* ${deal.source}\n`;

    if (deal.summary) {
      message += `\n_${deal.summary}_\n`;
    }

    if (deal.article_url) {
      message += `\n[Read full release](${deal.article_url})`;
    }

    return this.bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  }

  /**
   * Send all unnotified deals to the configured chat.
   */
  async notifyNewDeals() {
    const deals = this.store.getUnnotifiedDeals();
    if (deals.length === 0) return 0;

    this.log.info(`📨 Sending ${deals.length} new deal notification(s)`);

    const notifiedIds = [];
    for (const deal of deals) {
      try {
        await this._sendDealMessage(config.telegram.chatId, deal);
        notifiedIds.push(deal.id);
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        this.log.error(`Failed to notify deal ${deal.id}: ${err.message}`);
      }
    }

    this.store.markNotified(notifiedIds);
    return notifiedIds.length;
  }

  stop() {
    this.bot.stopPolling();
  }
}

export default DealNotifier;
