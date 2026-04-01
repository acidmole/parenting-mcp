import { getWilmaSchedule } from "../services/wilma.js";
import { GetWilmaScheduleSchema } from "../schemas.js";

export const definition = {
  name: "get_wilma_schedule",
  description:
    "Hae lukujärjestys tietylle päivälle tai viikolle. Tukee 'today', 'tomorrow', 'week' tai tarkkaa päivämäärää.",
  inputSchema: {
    type: "object" as const,
    properties: {
      when: {
        type: "string",
        enum: ["today", "tomorrow", "week"],
        description: "Shorthand: today, tomorrow, or week",
      },
      date: {
        type: "string",
        description: "Specific date in YYYY-MM-DD format (overrides 'when')",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      },
    },
  },
};

export async function handler(args: unknown) {
  const parsed = GetWilmaScheduleSchema.parse(args ?? {});
  const result = await getWilmaSchedule(parsed);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
