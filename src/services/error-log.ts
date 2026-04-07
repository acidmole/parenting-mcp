import { appendFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = resolve(__dirname, "../../errors.log");

export type ErrorSource = "wilma" | "whatsapp" | "scheduler";

export async function logError(
  source: ErrorSource,
  context: string,
  error: unknown
): Promise<void> {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const line = `[${timestamp}] [${source}] ${context}: ${message}\n`;
  try {
    await appendFile(LOG_PATH, line, "utf-8");
  } catch {
    // Fall back to stderr if the log file can't be written
    console.error(`error-log write failed: ${line.trim()}`);
  }
}
