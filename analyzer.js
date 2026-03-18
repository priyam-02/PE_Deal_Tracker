import config from "./config.js";

const SYSTEM_PROMPT = `You are a private equity M&A analyst. Your job is to analyze press releases and determine:

1. Is this about a COMPLETED or ANNOUNCED M&A transaction (acquisition, merger, buyout, take-private, divestiture)?
2. Is a Private Equity firm involved as the ACQUIRER, or is the acquirer a PE-backed portfolio company?

You MUST respond with ONLY a valid JSON object. No markdown, no backticks, no explanation. Just JSON.

Response format:
{
  "is_pe_deal": true/false,
  "confidence": 0.0-1.0,
  "acquirer": "Name of acquiring company or PE firm",
  "target": "Name of company being acquired",
  "pe_firm": "Name of PE firm (if identifiable, else null)",
  "deal_value": "Dollar amount if mentioned (e.g. '$2.1B'), else null",
  "deal_type": "One of: acquisition, merger, lbo, take-private, bolt-on, add-on, carve-out, recapitalization, divestiture, other",
  "sector": "Industry sector of the target company",
  "expected_close": "Expected closing date/period if mentioned, else null",
  "summary": "1-2 sentence summary of the deal"
}

Rules:
- is_pe_deal = true ONLY if a PE firm is the acquirer OR the acquirer is explicitly described as PE-backed/portfolio company
- If the press release is about a non-PE strategic acquisition, set is_pe_deal = false
- If it's not an M&A transaction at all (e.g. product launch, earnings, partnership), set is_pe_deal = false and leave other fields null
- confidence = how confident you are that this is a real PE deal (0.0 to 1.0)
- Be precise with company names — use the full legal name when available`;

/**
 * Send a press release to Nemotron for PE deal classification + extraction.
 */
async function analyzePressRelease(article, logger) {
  const userPrompt = `Analyze this press release:

HEADLINE: ${article.title}

CONTENT: ${article.summary}

SOURCE: ${article.source}
PUBLISHED: ${article.published}

Is this a PE-related M&A deal? Extract the details.`;

  try {
    const response = await fetch(`${config.nim.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.nim.apiKey}`,
      },
      body: JSON.stringify({
        model: config.nim.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`NIM API error ${response.status}: ${errText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      logger.warn("Empty response from Nemotron");
      return null;
    }

    // Clean up potential markdown fences
    const cleaned = content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    logger.debug(
      `Analysis: is_pe_deal=${parsed.is_pe_deal}, confidence=${parsed.confidence}, ` +
        `acquirer=${parsed.acquirer}, target=${parsed.target}`
    );

    return parsed;
  } catch (err) {
    logger.error(`Nemotron analysis failed: ${err.message}`);
    return null;
  }
}

/**
 * Batch analyze multiple articles with rate limiting.
 * Returns only confirmed PE deals above the confidence threshold.
 */
async function analyzeArticles(articles, logger, confidenceThreshold = 0.6) {
  const deals = [];

  for (const article of articles) {
    logger.info(`🧠 Analyzing: "${article.title.slice(0, 80)}..."`);

    const result = await analyzePressRelease(article, logger);

    if (result && result.is_pe_deal && result.confidence >= confidenceThreshold) {
      deals.push({
        article_url: article.url,
        acquirer: result.acquirer || "Unknown",
        target: result.target || "Unknown",
        deal_value: result.deal_value,
        deal_type: result.deal_type || "acquisition",
        sector: result.sector,
        pe_firm: result.pe_firm,
        expected_close: result.expected_close,
        summary: result.summary,
        source: article.source,
        headline: article.title,
        published_at: article.published,
      });

      logger.info(
        `✅ PE Deal found! ${result.pe_firm || result.acquirer} → ${result.target} (${result.confidence * 100}% confidence)`
      );
    } else if (result && !result.is_pe_deal) {
      logger.debug(`⏭️  Not a PE deal: "${article.title.slice(0, 60)}..."`);
    }

    // Small delay between API calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  return deals;
}

export { analyzePressRelease, analyzeArticles };
