import TelegramBot from "node-telegram-bot-api";
import config from "./config.js";

class DealNotifier {
  constructor(logger, dealStore) {
    this.log = logger;
    this.store = dealStore;
    this.bot = new TelegramBot(config.telegram.token, { polling: true });
    this._registerCommands();
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
          `/status — Bot status and stats\n` +
          `/recent — Last 5 deals found\n` +
          `/chatid — Show your chat ID\n\n` +
          `I'll send you alerts automatically when new PE deals are announced.`,
        { parse_mode: "Markdown" }
      );
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
        const deals = this.store.db
          .prepare("SELECT * FROM deals ORDER BY created_at DESC LIMIT 5")
          .all();

        if (deals.length === 0) {
          this.bot.sendMessage(msg.chat.id, "No deals found yet. Still scanning...");
          return;
        }

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

    this.bot.sendMessage(chatId, message, {
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
        this._sendDealMessage(config.telegram.chatId, deal);
        notifiedIds.push(deal.id);
        // Small delay between messages to avoid Telegram rate limits
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
