import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

const WILMA_BIN = "wilma";
const EXEC_TIMEOUT = 30_000;
const MAX_BUFFER = 1024 * 1024;
const CONFIG_PATH = join(homedir(), ".config", "wilmai", "config.json");

interface WilmaProfile {
  id: string;
  tenantUrl: string;
  tenantName: string;
  username: string;
  students: { studentNumber: string; name: string }[];
}

interface WilmaConfig {
  profiles: WilmaProfile[];
  lastProfileId: string;
}

async function readConfig(): Promise<WilmaConfig> {
  const raw = await readFile(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeConfig(config: WilmaConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

async function runWilmaRaw(args: string[], retries = 2): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(WILMA_BIN, args, {
      timeout: EXEC_TIMEOUT,
      maxBuffer: MAX_BUFFER,
    });
    return JSON.parse(stdout);
  } catch (error: unknown) {
    if (error instanceof Error) {
      if ("killed" in error && (error as Record<string, unknown>).killed) {
        throw new Error("Wilma CLI timed out (30s). Try again later.");
      }
      if (
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        throw new Error(
          "Wilma CLI not found. Install with: npm install -g @wilm-ai/wilma-cli"
        );
      }
      if ("stderr" in error) {
        const stderr = (error as { stderr: string }).stderr;
        if (stderr.includes("login") || stderr.includes("auth")) {
          throw new Error(
            "Wilma authentication required. Run 'wilma' interactively to log in first."
          );
        }
        // Retry on HTTP 403 — session likely expired, CLI will re-authenticate
        if (stderr.includes("HTTP 403") && retries > 0) {
          await new Promise((r) => setTimeout(r, 2000));
          return runWilmaRaw(args, retries - 1);
        }
      }
      throw new Error(`Wilma CLI error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Run a wilma command across all profiles and merge results.
 * Temporarily switches lastProfileId for each profile, then restores the original.
 */
async function runWilmaAllProfiles(args: string[]): Promise<unknown[]> {
  const config = await readConfig();
  const originalProfileId = config.lastProfileId;
  const results: unknown[] = [];

  try {
    for (const profile of config.profiles) {
      config.lastProfileId = profile.id;
      await writeConfig(config);
      const result = await runWilmaRaw(args);
      results.push(result);
    }
  } finally {
    config.lastProfileId = originalProfileId;
    await writeConfig(config);
  }

  return results;
}

/**
 * Merge student-based results from multiple profiles.
 * Handles both { students: [...] } and flat array formats.
 */
function mergeStudentResults(results: unknown[]): { students: unknown[] } {
  const allStudents: unknown[] = [];
  for (const result of results) {
    if (result && typeof result === "object") {
      const r = result as Record<string, unknown>;
      if (Array.isArray(r.students)) {
        allStudents.push(...r.students);
      } else if (Array.isArray(result)) {
        allStudents.push(...result);
      }
    }
  }
  return { students: allStudents };
}

/**
 * Merge flat array results from multiple profiles.
 */
function mergeArrayResults(results: unknown[]): unknown[] {
  const all: unknown[] = [];
  for (const result of results) {
    if (Array.isArray(result)) {
      all.push(...result);
    }
  }
  return all;
}

async function runWilma(args: string[]): Promise<unknown> {
  const results = await runWilmaAllProfiles(args);
  // If any result has a "students" key, merge as student results
  if (results.some((r) => r && typeof r === "object" && !Array.isArray(r) && "students" in (r as Record<string, unknown>))) {
    return mergeStudentResults(results);
  }
  // If results are arrays, merge them
  if (results.every((r) => Array.isArray(r))) {
    return mergeArrayResults(results);
  }
  // Fallback: return merged student format
  return mergeStudentResults(results);
}

export async function getWilmaSummary(days: number = 7): Promise<unknown> {
  return runWilma([
    "summary",
    "--days",
    String(days),
    "--all-students",
    "--json",
  ]);
}

export async function getWilmaSchedule(options: {
  when?: string;
  date?: string;
}): Promise<unknown> {
  const args = ["schedule", "list", "--all-students", "--json"];
  if (options.date) {
    args.push("--date", options.date);
  } else if (options.when) {
    args.push("--when", options.when);
  }
  return runWilma(args);
}

export async function getWilmaExams(limit: number = 20): Promise<unknown> {
  return runWilma([
    "exams",
    "list",
    "--limit",
    String(limit),
    "--all-students",
    "--json",
  ]);
}

export async function getWilmaHomework(limit: number = 10): Promise<unknown> {
  return runWilma([
    "homework",
    "list",
    "--limit",
    String(limit),
    "--all-students",
    "--json",
  ]);
}

export async function getWilmaNews(limit: number = 20): Promise<unknown> {
  return runWilma([
    "news",
    "list",
    "--limit",
    String(limit),
    "--all-students",
    "--json",
  ]);
}

export async function getWilmaMessages(
  limit: number = 20,
  folder: string = "inbox"
): Promise<unknown> {
  return runWilma([
    "messages",
    "list",
    "--folder",
    folder,
    "--limit",
    String(limit),
    "--all-students",
    "--json",
  ]);
}

export async function getWilmaKids(): Promise<unknown> {
  const results = await runWilmaAllProfiles(["kids", "list", "--json"]);
  return mergeArrayResults(results);
}
