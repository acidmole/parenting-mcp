import { getWilmaNews } from "../services/wilma.js";
import { GetWilmaNewsSchema } from "../schemas.js";

export const definition = {
  name: "get_wilma_news",
  description:
    "Hae koulun uutiset ja tiedotteet. Sisältää retket, tapahtumat ja muut erikoishuomiot.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of news items to return",
        default: 20,
        minimum: 1,
        maximum: 50,
      },
    },
  },
};

export async function handler(args: unknown) {
  const { limit } = GetWilmaNewsSchema.parse(args ?? {});
  const result = await getWilmaNews(limit);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
