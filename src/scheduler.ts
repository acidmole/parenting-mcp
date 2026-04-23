import cron from "node-cron";
import { execFile } from "node:child_process";
import { disconnect } from "./services/whatsapp.js";
import { loadConfig, isConfigured } from "./services/config.js";
import { logError } from "./services/error-log.js";
import { sendHomeworkSummary, sendEveningSchedule, sendWeeklyOverview } from "./jobs.js";

const config = await loadConfig();

if (!isConfigured(config)) {
  console.error("WhatsApp-kohdetta ei ole määritetty. Aja ensin: npm run setup");
  process.exit(1);
}

console.log("Parenting scheduler starting...");
console.log(`Target: ${config.whatsapp.targetName} (${config.whatsapp.targetJid})`);

const { homeworkCron, eveningCron, weeklyCron, timezone } = config.schedule;

cron.schedule(homeworkCron, () => {
  sendHomeworkSummary(config).catch((err) => {
    void logError("scheduler", "homework summary failed", err);
    console.error("Homework summary failed:", err);
  });
}, { timezone });

cron.schedule(eveningCron, () => {
  sendEveningSchedule(config).catch((err) => {
    void logError("scheduler", "evening schedule failed", err);
    console.error("Evening schedule failed:", err);
  });
}, { timezone });

cron.schedule(weeklyCron, () => {
  sendWeeklyOverview(config).catch((err) => {
    void logError("scheduler", "weekly overview failed", err);
    console.error("Weekly overview failed:", err);
  });
}, { timezone });

console.log("Scheduled:");
console.log(`  - Homework summary: ${homeworkCron}`);
console.log(`  - Tomorrow's schedule: ${eveningCron}`);
console.log(`  - Weekly overview: ${weeklyCron}`);
console.log("Running...");

// --- systemd watchdog heartbeat ---
// If WatchdogSec is configured, send periodic WATCHDOG=1 to systemd.
// When the event loop is blocked (e.g. Baileys hang), heartbeats stop
// and systemd will kill & restart the process.

function sdNotify(...args: string[]): void {
  if (!process.env.NOTIFY_SOCKET) return;
  execFile("systemd-notify", args, () => {});
}

function startWatchdog(): void {
  if (!process.env.NOTIFY_SOCKET) return;

  sdNotify("--ready");

  const intervalMs = Math.max(
    5_000,
    Math.floor((Number(process.env.WATCHDOG_USEC) || 120_000_000) / 2 / 1000)
  );

  // Track wall-clock time to detect suspend/resume gaps.
  // node-cron uses setTimeout internally, which breaks after system suspend
  // because timers freeze during sleep. When we detect a gap, we exit so
  // systemd restarts us with fresh, working timers.
  let lastTick = Date.now();
  const SUSPEND_THRESHOLD_MS = intervalMs * 3;

  const timer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastTick;
    lastTick = now;

    if (elapsed > SUSPEND_THRESHOLD_MS) {
      console.log(`Detected system resume (gap: ${Math.round(elapsed / 1000)}s). Restarting to fix cron timers...`);
      disconnect();
      process.exit(0); // systemd Restart=on-failure restarts us
    }

    sdNotify("WATCHDOG=1");
  }, intervalMs);

  timer.unref();

  console.log(`Watchdog heartbeat every ${intervalMs / 1000}s`);
}

startWatchdog();

// Graceful shutdown
function shutdown() {
  console.log("Shutting down scheduler...");
  disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
