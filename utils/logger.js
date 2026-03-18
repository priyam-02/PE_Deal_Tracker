const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor(level = "info") {
    this.level = LEVELS[level] ?? LEVELS.info;
  }

  _log(levelName, args) {
    if (LEVELS[levelName] >= this.level) {
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      console.log(`[${ts}] [${levelName.toUpperCase()}]`, ...args);
    }
  }

  debug(...args) { this._log("debug", args); }
  info(...args)  { this._log("info",  args); }
  warn(...args)  { this._log("warn",  args); }
  error(...args) { this._log("error", args); }
}

export default Logger;
