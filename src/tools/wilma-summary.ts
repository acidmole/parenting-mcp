import { getWilmaSummary } from "../services/wilma.js";
import { GetWilmaSummarySchema } from "../schemas.js";

export const definition = {
  name: "get_wilma_summary",
  description:
    "Hae päivittäinen Wilma-yhteenveto kaikille oppilaille. Sisältää aikataulun, kotitehtävät, kokeet ja viestit.",
  inputSchema: {
    type: "object" as const,
    properties: {
      days: {
        type: "number",
        description: "Number of days to include in summary (default 7)",
        default: 7,
        minimum: 1,
        maximum: 30,
      },
    },
  },
};

export async function handler(args: unknown) {
  const { days } = GetWilmaSummarySchema.parse(args ?? {});
  const result = await getWilmaSummary(days);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
