import { getWilmaSchedule, getWilmaExams, getWilmaNews } from "../services/wilma.js";
import { sendMessage } from "../services/whatsapp.js";
import { SendWeeklySummarySchema } from "../schemas.js";

export const definition = {
  name: "send_weekly_summary",
  description:
    "Koosta ja lähetä viikkoyhteenveto WhatsApp-ryhmään. Sisältää tulevan viikon aikataulun, kokeet ja koulun tiedotteet. LÄHETTÄÄ OIKEAN VIESTIN.",
  inputSchema: {
    type: "object" as const,
    properties: {
      group_jid: {
        type: "string",
        description: "WhatsApp group JID to send the weekly summary to",
      },
    },
    required: ["group_jid"],
  },
};

function getNextWeekDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  // Start from next Monday (or today if Monday)
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;

  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + daysUntilMonday + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/** Extract students array from Wilma CLI response ({ students: [...] } or flat array). */
function extractStudents(data: unknown): Record<string, unknown>[] {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.students)) return d.students as Record<string, unknown>[];
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

function formatWeeklySummary(
  schedule: unknown,
  exams: unknown,
  news: unknown,
  weekDates: string[]
): string {
  const lines: string[] = [];
  const today = new Date();
  const nextMonday = new Date(today);
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek) % 7 || 7;
  nextMonday.setDate(today.getDate() + daysUntilMonday);

  const weekNum = getISOWeek(nextMonday);
  lines.push(`📋 *Viikkoyhteenveto - Viikko ${weekNum}*`);
  lines.push("");

  // Exams — grouped by student
  const students = extractStudents(exams);
  const mondayStr = weekDates[0];
  const fridayStr = weekDates[4];
  const examLines: string[] = [];

  for (const student of students) {
    const info = student.student as Record<string, unknown> | undefined;
    const name = firstName((info?.name as string) || (student.name as string) || "Oppilas");
    const items = (student.items || []) as Record<string, unknown>[];
    const weekExams = items.filter(
      (e) => (e.date as string) >= mondayStr && (e.date as string) <= fridayStr
    );
    for (const exam of weekExams) {
      const d = new Date((exam.date as string) + "T12:00:00");
      const dayStr = d.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" });
      examLines.push(`  • ${dayStr} ${name}: ${exam.subject || ""}${exam.topic ? ` — ${exam.topic}` : ""}`);
    }
  }

  lines.push("🔔 *Kokeet:*");
  if (examLines.length > 0) {
    examLines.sort();
    lines.push(...examLines);
  } else {
    lines.push("  Ei kokeita tällä viikolla! 🎉");
  }
  lines.push("");

  // News — extract from { students: [{ items: [...] }] } structure
  const newsStudents = extractStudents(news);
  const allNews: Record<string, unknown>[] = [];
  for (const student of newsStudents) {
    const items = (student.items || []) as Record<string, unknown>[];
    allNews.push(...items);
  }

  if (allNews.length > 0) {
    lines.push("📢 *Tiedotteet:*");
    for (const n of allNews.slice(0, 5)) {
      lines.push(`  • ${n.title || n.subject || ""}`);
    }
    lines.push("");
  }

  lines.push("Hyvää viikkoa! 💪");
  return lines.join("\n");
}

function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

export async function handler(args: unknown) {
  const { group_jid } = SendWeeklySummarySchema.parse(args);

  // Fetch sequentially — all use runWilmaAllProfiles which writes to shared config file
  const weekDates = getNextWeekDates();
  const schedule = await getWilmaSchedule({ when: "week" });
  const exams = await getWilmaExams(50);
  const news = await getWilmaNews(10);

  const message = formatWeeklySummary(schedule, exams, news, weekDates);
  await sendMessage(group_jid, message, true);

  return {
    content: [
      {
        type: "text" as const,
        text: `Viikkoyhteenveto lähetetty ryhmään ${group_jid}.\n\nViestin sisältö:\n${message}`,
      },
    ],
  };
}
