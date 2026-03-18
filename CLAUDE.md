# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm start         # Run the tracker (node src/index.js)
npm test          # Run component tests (node src/test-run.js)
```

Before running, copy `.env.example` to `.env` and fill in the required values (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NIM_API_KEY`).

## Architecture

This is a Node.js ESM project (`"type": "module"`). The pipeline runs on a configurable polling interval:

```
RSS Feeds → keyword pre-filter → dedup (SQLite) → Nemotron classification → SQLite store → Telegram notification
```

**Key modules (all at project root):**
- [index.js](index.js) — Entry point. Runs `pollCycle()` immediately, then on interval. Handles graceful shutdown.
- [fetcher.js](fetcher.js) — Fetches RSS feeds via `rss-parser`, applies a keyword pre-filter (`PE_KEYWORDS`) to reduce NIM API calls.
- [feeds.js](feeds.js) — RSS feed URL definitions and per-source item parsers for PR Newswire, BusinessWire, GlobeNewsWire.
- [analyzer.js](analyzer.js) — Calls NVIDIA NIM (`/chat/completions`) with a structured prompt. Returns JSON with `is_pe_deal`, `confidence`, acquirer/target details. Filters results by a confidence threshold (default `0.6`). Adds 500ms delay between API calls.
- [database.js](database.js) — SQLite via `better-sqlite3`. Two tables: `seen_articles` (dedup by URL) and `deals` (confirmed PE deals with `notified` flag). DB file is `deals.db` in `process.cwd()`.
- [telegram.js](telegram.js) — Telegram bot with polling. Handles `/start`, `/status`, `/recent`, `/chatid` commands. `notifyNewDeals()` sends unnotified deals and marks them notified. Adds 1s delay between messages.

**Note:** The README describes a `src/` subdirectory layout, but the actual source files are at the project root. If a `config.js` or `utils/logger.js` is referenced in imports, those files need to be created.

## Data Flow Details

1. `fetchAllFeeds()` fetches up to `MAX_ITEMS_PER_SOURCE` items per feed URL, filters by `PE_KEYWORDS`
2. `store.markSeen()` uses `INSERT OR IGNORE` — returns `true` only for newly inserted URLs
3. `analyzeArticles()` sends each new article to NIM sequentially (not batched), skips if `is_pe_deal=false` or `confidence < 0.6`
4. `store.saveDeal()` uses `INSERT OR IGNORE` on `article_url` to prevent duplicates
5. `notifier.notifyNewDeals()` queries `WHERE notified = 0`, sends each, then bulk-updates `notified = 1`

## Environment Variables

| Variable | Required | Default |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | — |
| `TELEGRAM_CHAT_ID` | yes | — |
| `NIM_API_KEY` | yes | — |
| `NIM_BASE_URL` | no | `https://integrate.api.nvidia.com/v1` |
| `NIM_MODEL` | no | `nvidia/nemotron-3-super-120b-a12b` |
| `POLL_INTERVAL_MINUTES` | no | `15` |
| `MAX_ITEMS_PER_SOURCE` | no | `25` |
| `LOG_LEVEL` | no | `info` |
