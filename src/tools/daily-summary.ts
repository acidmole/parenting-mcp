import { getWilmaSummary } from "../services/wilma.js";
import { sendMessage } from "../services/whatsapp.js";
import { SendDailySummarySchema } from "../schemas.js";

export const definition = {
  name: "send_daily_summary",
  description:
    "Koosta ja lähetä päivittäinen Wilma-aamuyhteenveto WhatsApp-ryhmään. Sisältää päivän aikataulun, kotitehtävät ja tulevat kokeet 7 päivän sisällä. LÄHETTÄÄ OIKEAN VIESTIN.",
  inputSchema: {
    type: "object" as const,
    properties: {
      group_jid: {
        type: "string",
        description: "WhatsApp group JID to send the daily summary to",
      },
    },
    required: ["group_jid"],
  },
};

function formatDailySummary(data: unknown): string {
  const lines: string[] = [];
  const today = new Date();
  const dateStr = today.toLocaleDateString("fi-FI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  lines.push(`📅 *Päivän yhteenveto - ${dateStr}*`);
  lines.push("");

  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;

    // Students summary
    if (Array.isArray(d.students)) {
      for (const student of d.students) {
        const s = student as Record<string, unknown>;
        lines.push(`👤 *${s.name || "Oppilas"}*`);

        // Schedule
        if (Array.isArray(s.schedule) && s.schedule.length > 0) {
          lines.push("📚 Tunnit:");
          for (const lesson of s.schedule) {
            const l = lesson as Record<string, unknown>;
            lines.push(`  • ${l.time || ""} ${l.subject || l.course || ""}`);
          }
        }

        // Homework
        if (Array.isArray(s.homework) && s.homework.length > 0) {
          lines.push("📝 Kotitehtävät:");
          for (const hw of s.homework) {
            const h = hw as Record<string, unknown>;
            lines.push(`  • ${h.subject || ""}: ${h.description || h.topic || ""}`);
          }
        }

        // Exams
        if (Array.isArray(s.exams) && s.exams.length > 0) {
          lines.push("🔔 Tulevat kokeet:");
          for (const exam of s.exams) {
            const e = exam as Record<string, unknown>;
            lines.push(`  • ${e.date || ""} ${e.subject || ""}: ${e.description || e.topic || ""}`);
          }
        }

        lines.push("");
      }
    } else {
      // Flat structure - just dump it readably
      lines.push(JSON.stringify(data, null, 2));
    }
  } else {
    lines.push("Ei dataa saatavilla.");
  }

  return lines.join("\n");
}

export async function handler(args: unknown) {
  const { group_jid } = SendDailySummarySchema.parse(args);

  const summaryData = await getWilmaSummary(7);
  const message = formatDailySummary(summaryData);

  await sendMessage(group_jid, message, true);

  return {
    content: [
      {
        type: "text" as const,
        text: `Päivittäinen yhteenveto lähetetty ryhmään ${group_jid}.\n\nViestin sisältö:\n${message}`,
      },
    ],
  };
}
