import Parser from "rss-parser";
import SOURCES from "./feeds.js";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "PE-Deal-Tracker/1.0",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

/**
 * Quick keyword pre-filter — if the title or summary contains any of
 * these terms it's worth sending to Nemotron for deeper analysis.
 * This reduces unnecessary API calls.
 */
const PE_KEYWORDS = [
  "acqui",          // acquire, acquired, acquisition
  "merger",
  "private equity",
  "buyout",
  "lbo",
  "portfolio company",
  "capital partners",
  "management partners",
  "equity partners",
  "investment partners",
  "definitive agreement",
  "purchase agreement",
  "take private",
  "going private",
  "recapitalization",
  "platform acquisition",
  "bolt-on",
  "add-on acquisition",
  "sponsor",         // PE sponsor
  "backed by",
  "fund ",           // catches "fund VII", "fund IV" etc.
  "carve-out",
  "divestiture",
];

function passesKeywordFilter(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  return PE_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Fetch all RSS feeds, apply keyword pre-filter, return candidate articles.
 */
async function fetchAllFeeds(maxPerSource, logger) {
  const candidates = [];

  for (const [key, source] of Object.entries(SOURCES)) {
    for (const feedUrl of source.feeds) {
      try {
        logger.debug(`Fetching ${source.name}: ${feedUrl}`);
        const feed = await parser.parseURL(feedUrl);
        const items = (feed.items || []).slice(0, maxPerSource);

        for (const item of items) {
          const parsed = source.parseItem(item);
          if (!parsed.url) continue;

          if (passesKeywordFilter(parsed.title, parsed.summary)) {
            candidates.push(parsed);
          }
        }

        logger.info(
          `📡 ${source.name}: ${items.length} items fetched, ${candidates.length} candidates so far`
        );
      } catch (err) {
        logger.warn(`Failed to fetch ${source.name} feed: ${err.message}`);
      }
    }
  }

  return candidates;
}

export { fetchAllFeeds, passesKeywordFilter };
