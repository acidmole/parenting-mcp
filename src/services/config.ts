import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../../config.json");

export interface OnlineCourseFilter {
  studentFirstName: string;
  startTime: string;
  subjectCodePatterns: string[];
}

export interface AppConfig {
  whatsapp: {
    targetJid: string;
    isGroup: boolean;
    targetName: string;
  };
  schedule: {
    homeworkCron: string;
    eveningCron: string;
    weeklyCron: string;
    timezone: string;
  };
  filters: {
    onlineCourses: OnlineCourseFilter[];
  };
}

const DEFAULT_CONFIG: AppConfig = {
  whatsapp: {
    targetJid: "",
    isGroup: true,
    targetName: "",
  },
  schedule: {
    homeworkCron: "2 16 * * *",
    eveningCron: "3 20 * * *",
    weeklyCron: "57 17 * * 0",
    timezone: "Europe/Helsinki",
  },
  filters: {
    onlineCourses: [],
  },
};

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function isConfigured(config: AppConfig): boolean {
  return config.whatsapp.targetJid.length > 0;
}
