import { listContacts } from "../services/whatsapp.js";
import { ListWhatsAppContactsSchema } from "../schemas.js";

export const definition = {
  name: "list_whatsapp_contacts",
  description:
    "Listaa WhatsApp-yhteystiedot. Voit suodattaa nimellä.",
  inputSchema: {
    type: "object" as const,
    properties: {
      search: {
        type: "string",
        description: "Optional search filter for contact name",
      },
    },
  },
};

export async function handler(args: unknown) {
  const { search } = ListWhatsAppContactsSchema.parse(args ?? {});
  const contacts = await listContacts(search);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(contacts, null, 2),
      },
    ],
  };
}
