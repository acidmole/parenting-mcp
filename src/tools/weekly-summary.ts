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

function formatWeeklySummary(
  schedule: unknown,
  exams: unknown,
  news: unknown
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

  // Schedule
  lines.push("📚 *Viikon lukujärjestys:*");
  if (schedule && typeof schedule === "object") {
    if (Array.isArray(schedule)) {
      for (const day of schedule) {
        const d = day as Record<string, unknown>;
        lines.push(`  ${d.date || d.day || ""}: ${d.subject || JSON.stringify(d)}`);
      }
    } else {
      lines.push(JSON.stringify(schedule, null, 2));
    }
  } else {
    lines.push("  Ei aikataulutietoja.");
  }
  lines.push("");

  // Exams
  lines.push("🔔 *Kokeet:*");
  if (Array.isArray(exams) && exams.length > 0) {
    for (const exam of exams) {
      const e = exam as Record<string, unknown>;
      lines.push(`  • ${e.date || ""} ${e.subject || ""}: ${e.description || e.topic || ""}`);
    }
  } else {
    lines.push("  Ei kokeita tällä viikolla! 🎉");
  }
  lines.push("");

  // News
  if (Array.isArray(news) && news.length > 0) {
    lines.push("📢 *Tiedotteet:*");
    for (const item of news.slice(0, 5)) {
      const n = item as Record<string, unknown>;
      lines.push(`  • ${n.title || n.subject || ""} (${n.date || ""})`);
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

  // Fetch week schedule, exams for 7 days, and recent news
  const [schedule, exams, news] = await Promise.all([
    getWilmaSchedule({ when: "week" }),
    getWilmaExams(20),
    getWilmaNews(10),
  ]);

  // Filter exams to next 7 days
  const now = new Date();
  const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let filteredExams = exams;
  if (Array.isArray(exams)) {
    filteredExams = exams.filter((exam: Record<string, unknown>) => {
      if (!exam.date) return true;
      const examDate = new Date(exam.date as string);
      return examDate >= now && examDate <= cutoff;
    });
  }

  const message = formatWeeklySummary(schedule, filteredExams, news);
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
