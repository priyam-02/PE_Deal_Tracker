import { config as loadDotenv } from "dotenv";
loadDotenv();

function require(name, fallback) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return val;
}

const config = {
  logLevel: process.env.LOG_LEVEL ?? "info",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MINUTES ?? 15) * 60 * 1000,
  maxItemsPerSource: Number(process.env.MAX_ITEMS_PER_SOURCE ?? 25),

  telegram: {
    token: require("TELEGRAM_BOT_TOKEN"),
    chatId: require("TELEGRAM_CHAT_ID"),
  },

  nim: {
    baseUrl: process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    apiKey: require("NIM_API_KEY"),
    model: process.env.NIM_MODEL ?? "nvidia/nemotron-3-super-120b-a12b",
  },
};

export default config;
