import Parser from "rss-parser";
import { analyzeArticles } from "./analyzer.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; PE-Deal-Tracker/1.0)",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

/**
 * Extract readable text from HTML — strips tags, scripts, styles.
 */
function extractText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000); // Keep first 3000 chars to fit in Nemotron context
}

/**
 * Fetch a web page and extract its text content.
 */
async function scrapeArticle(url, logger) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      logger.debug(`Failed to fetch ${url}: ${res.status}`);
      return null;
    }

    const html = await res.text();
    const text = extractText(html);
    return text.length > 100 ? text : null;
  } catch (err) {
    logger.debug(`Scrape failed for ${url}: ${err.message}`);
    return null;
  }
}

/**
 * Search for PE deals related to a firm name.
 *
 * 1. Google News RSS search (goes back months, covers all news sites)
 * 2. Scrapes each article for full content
 * 3. Sends to Nemotron for PE deal classification
 */
async function searchFirmDeals(firmName, logger, maxResults = 15) {
  // Step 1: Search Google News
  const query = encodeURIComponent(
    `"${firmName}" acquisition OR buyout OR "private equity" OR merger OR takeover OR deal`
  );
  const searchUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  logger.info(`🔎 Searching web for: "${firmName}" deals...`);

  let articles = [];
  try {
    const feed = await parser.parseURL(searchUrl);
    const items = (feed.items || []).slice(0, maxResults);

    logger.info(`🔎 Found ${items.length} news results for "${firmName}"`);

    // Step 2: Scrape each article for full content
    for (const item of items) {
      const url = item.link || item.guid || "";
      if (!url) continue;

      logger.debug(`📄 Scraping: ${item.title?.slice(0, 60)}...`);
      const fullText = await scrapeArticle(url, logger);

      articles.push({
        title: item.title || "",
        url,
        summary: fullText || item.contentSnippet || item.content || "",
        published: item.pubDate || item.isoDate || "",
        source: item.source?.name || "Web",
      });

      // Small delay between scrapes
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (err) {
    logger.error(`Search failed: ${err.message}`);
    return { articles: 0, deals: [] };
  }

  if (articles.length === 0) {
    return { articles: 0, deals: [] };
  }

  // Step 3: Send all articles to Nemotron for analysis
  logger.info(`🧠 Analyzing ${articles.length} articles with Nemotron...`);
  const deals = await analyzeArticles(articles, logger, 0.5); // lower threshold for search

  return { articles: articles.length, deals };
}

export { searchFirmDeals, scrapeArticle };
