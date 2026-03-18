# 🤝 PE Deal Tracker

A Telegram bot that monitors press releases from major wire services for Private Equity M&A activity and sends real-time alerts. Uses NVIDIA Nemotron (via NIM) for intelligent classification — not just keyword matching.

## Architecture

```
PR Newswire  ──┐
BusinessWire ──┤── RSS ──► Poller ──► Nemotron ──► SQLite ──► Telegram
GlobeNewsWire──┘           (dedup)    (classify)   (store)    (notify)
```

## What It Tracks

- PE firm acquisitions (direct buyouts)
- PE-backed portfolio company acquisitions (bolt-ons, add-ons)
- Take-private transactions
- Leveraged buyouts
- PE-related carve-outs and divestitures

## Setup

### 1. Create Your Telegram Bot

1. Open Telegram and message `@BotFather`
2. Send `/newbot` and follow the prompts
3. Copy the bot token you receive
4. Message your new bot, then message `@userinfobot` to get your chat ID

### 2. Add Network Policies to Your Sandbox

Your nemoclaw sandbox needs outbound access to the wire services. Apply the included policy file:

```bash
# Review what will be added
cat network-policies.yaml

# Apply (adjust command based on your nemoclaw version)
nemoclaw jarvis policy update --file network-policies.yaml
```

This adds GET-only access to:
- `www.prnewswire.com` (RSS feeds)
- `www.businesswire.com` + `feed.businesswire.com` (RSS feeds)
- `www.globenewswire.com` (RSS feeds)

### 3. Start NIM

Make sure NIM is running in your sandbox:

```bash
nemoclaw jarvis nim start
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values:
#   TELEGRAM_BOT_TOKEN=...
#   TELEGRAM_CHAT_ID=...
#   NIM_API_KEY=...
```

### 5. Install and Run

```bash
# Inside your sandbox
cd /sandbox/pe-deal-tracker
npm install
npm start
```

### 6. Verify

```bash
# Run component tests first
npm test
```

Or message your bot on Telegram:
- `/start` — Welcome message
- `/status` — Check stats
- `/recent` — Last 5 deals found
- `/chatid` — Confirm your chat ID

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | required | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | required | Your Telegram chat ID |
| `NIM_API_KEY` | required | NVIDIA NIM API key |
| `NIM_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | Model to use |
| `POLL_INTERVAL_MINUTES` | `15` | How often to check feeds |
| `MAX_ITEMS_PER_SOURCE` | `25` | RSS items per feed per poll |
| `LOG_LEVEL` | `info` | debug, info, warn, error |

## How It Works

1. **Fetch** — Polls RSS feeds from all 3 wire services every 15 minutes
2. **Pre-filter** — Keyword filter catches PE-related terms (acquire, buyout, portfolio company, etc.) to reduce unnecessary API calls
3. **Dedup** — Checks each article URL against SQLite to skip already-seen articles
4. **Analyze** — Sends new candidates to Nemotron with a structured prompt asking it to classify whether the deal involves PE and extract deal details
5. **Store** — Saves confirmed PE deals to SQLite with all extracted fields
6. **Notify** — Sends formatted Telegram alerts for new deals

## Project Structure

```
pe-deal-tracker/
├── src/
│   ├── index.js            # Main entry + polling loop
│   ├── config.js           # Env loader + validation
│   ├── analyzer.js         # Nemotron integration
│   ├── database.js         # SQLite store + dedup
│   ├── telegram.js         # Bot + notifications
│   ├── test-run.js         # Component tests
│   ├── sources/
│   │   ├── feeds.js        # RSS source definitions
│   │   └── fetcher.js      # RSS fetcher + keyword pre-filter
│   └── utils/
│       └── logger.js       # Simple logger
├── network-policies.yaml   # Sandbox network policy additions
├── .env.example            # Environment template
├── package.json
└── README.md
```

## Troubleshooting

**Bot not responding?**
- Check `TELEGRAM_BOT_TOKEN` is correct
- Make sure the Telegram network policy is active in your sandbox

**No deals showing up?**
- Run `npm test` to verify RSS feeds are reachable
- Check that NIM is running: `nemoclaw jarvis nim status`
- Lower `LOG_LEVEL` to `debug` for verbose output

**NIM API errors?**
- Verify `NIM_API_KEY` is valid
- Check NIM is started: `nemoclaw jarvis nim start`
- The NVIDIA endpoint network policy must be active

**RSS feeds failing?**
- Verify network policies are applied for the wire services
- Try `curl https://www.globenewswire.com/RssFeed/...` from inside the sandbox
