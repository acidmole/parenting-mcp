import { getWilmaHomework } from "../services/wilma.js";
import { GetWilmaHomeworkSchema } from "../schemas.js";

export const definition = {
  name: "get_wilma_homework",
  description:
    "Hae ajankohtaiset kotitehtävät kaikille oppilaille. Sisältää aineen, kuvauksen ja mahdollisen deadlinen.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of homework items to return",
        default: 10,
        minimum: 1,
        maximum: 50,
      },
    },
  },
};

export async function handler(args: unknown) {
  const { limit } = GetWilmaHomeworkSchema.parse(args ?? {});
  const result = await getWilmaHomework(limit);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
