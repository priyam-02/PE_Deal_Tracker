/**
 * RSS Feed sources for M&A press releases.
 * 
 * Each source defines one or more RSS feed URLs that cover
 * business/M&A categories from the wire services.
 */

const SOURCES = {
  prnewswire: {
    name: "PR Newswire",
    feeds: [
      // Mergers & Acquisitions category
      "https://www.prnewswire.com/rss/financial-services-latest-news/mergers-and-acquisitions-list.rss",
      // General business news (catches PE deals that aren't categorized under M&A)
      "https://www.prnewswire.com/rss/financial-services-latest-news/private-equity-list.rss",
    ],
    parseItem: (item) => ({
      title: item.title || "",
      url: item.link || item.guid || "",
      summary: item.contentSnippet || item.content || "",
      published: item.pubDate || item.isoDate || "",
      source: "PR Newswire",
    }),
  },

  businesswire: {
    name: "BusinessWire",
    feeds: [
      // BusinessWire doesn't have granular M&A RSS, so we use the main business feed
      "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpRWg==",
    ],
    parseItem: (item) => ({
      title: item.title || "",
      url: item.link || item.guid || "",
      summary: item.contentSnippet || item.content || "",
      published: item.pubDate || item.isoDate || "",
      source: "BusinessWire",
    }),
  },

  globenewswire: {
    name: "GlobeNewsWire",
    feeds: [
      // Mergers and Acquisitions subject
      "https://www.globenewswire.com/RssFeed/subjectcode/14-Mergers%20and%20Acquisitions/feedTitle/GlobeNewswire%20-%20Mergers%20and%20Acquisitions",
    ],
    parseItem: (item) => ({
      title: item.title || "",
      url: item.link || item.guid || "",
      summary: item.contentSnippet || item.content || "",
      published: item.pubDate || item.isoDate || "",
      source: "GlobeNewsWire",
    }),
  },
};

export default SOURCES;
