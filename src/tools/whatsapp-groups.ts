import { listGroups } from "../services/whatsapp.js";
import { ListWhatsAppGroupsSchema } from "../schemas.js";

export const definition = {
  name: "list_whatsapp_groups",
  description:
    "Listaa kaikki WhatsApp-ryhmät joihin kuulut. Palauttaa ryhmän nimen, JID:n ja jäsenmäärän.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
};

export async function handler(args: unknown) {
  ListWhatsAppGroupsSchema.parse(args ?? {});
  const groups = await listGroups();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(groups, null, 2),
      },
    ],
  };
}
