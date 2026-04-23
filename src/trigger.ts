import { loadConfig, isConfigured, type AppConfig } from "./services/config.js";
import { disconnect } from "./services/whatsapp.js";
import {
  sendHomeworkSummary,
  sendEveningSchedule,
  sendWeeklyOverview,
} from "./jobs.js";

// Each job is invoked with (config) — targets are encoded in the job name,
// e.g. "evening:today" or "evening" (defaults to tomorrow).
type JobRunner = (config: AppConfig) => Promise<void>;

const baseJobs: Record<string, JobRunner> = {
  homework: (c) => sendHomeworkSummary(c),
  evening: (c) => sendEveningSchedule(c, "tomorrow"),
  "evening:today": (c) => sendEveningSchedule(c, "today"),
  "evening:tomorrow": (c) => sendEveningSchedule(c, "tomorrow"),
  weekly: (c) => sendWeeklyOverview(c),
};

const arg = process.argv[2];

if (!arg) {
  console.error(`Usage: npm run trigger -- <job>[,<job>...]`);
  console.error(`  Jobs: ${Object.keys(baseJobs).join(", ")}`);
  console.error(`  Example: npm run trigger -- homework,evening:today`);
  process.exit(1);
}

const names = arg.split(",").map((s) => s.trim());

for (const name of names) {
  if (!(name in baseJobs)) {
    console.error(`Unknown job: ${name}`);
    console.error(`  Jobs: ${Object.keys(baseJobs).join(", ")}`);
    process.exit(1);
  }
}

const config = await loadConfig();

if (!isConfigured(config)) {
  console.error("WhatsApp-kohdetta ei ole määritetty. Aja ensin: npm run setup");
  process.exit(1);
}

try {
  for (const name of names) {
    console.log(`--- Triggering: ${name} ---`);
    await baseJobs[name](config);
  }
  console.log("All triggers done.");
} catch (err) {
  console.error("Trigger failed:", err);
  process.exitCode = 1;
} finally {
  disconnect();
  // give Baileys a moment to flush socket close, then force exit
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}
