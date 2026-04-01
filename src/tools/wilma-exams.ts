import { getWilmaExams } from "../services/wilma.js";
import { GetWilmaExamsSchema } from "../schemas.js";

export const definition = {
  name: "get_wilma_exams",
  description:
    "Hae tulevat kokeet. Oletuksena näyttää kokeet 7 päivän sisällä. Sisältää aineen, päivämäärän ja kuvauksen.",
  inputSchema: {
    type: "object" as const,
    properties: {
      days_ahead: {
        type: "number",
        description: "Number of days ahead to look for exams (default 7)",
        default: 7,
        minimum: 1,
        maximum: 90,
      },
      limit: {
        type: "number",
        description: "Maximum number of exams to return",
        default: 20,
        minimum: 1,
        maximum: 50,
      },
    },
  },
};

export async function handler(args: unknown) {
  const { days_ahead, limit } = GetWilmaExamsSchema.parse(args ?? {});

  const allExams = await getWilmaExams(limit);

  // Filter exams within days_ahead from today
  const now = new Date();
  const cutoff = new Date(now.getTime() + days_ahead * 24 * 60 * 60 * 1000);

  let filtered = allExams;
  if (Array.isArray(allExams)) {
    filtered = allExams.filter((exam: Record<string, unknown>) => {
      if (!exam.date) return true; // keep if no date
      const examDate = new Date(exam.date as string);
      return examDate >= now && examDate <= cutoff;
    });
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(filtered, null, 2),
      },
    ],
  };
}
