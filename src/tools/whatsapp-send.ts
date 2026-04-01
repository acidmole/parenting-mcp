import { sendMessage } from "../services/whatsapp.js";
import { SendWhatsAppMessageSchema } from "../schemas.js";

export const definition = {
  name: "send_whatsapp_message",
  description:
    "Lähetä WhatsApp-viesti henkilölle tai ryhmään. LÄHETTÄÄ OIKEAN VIESTIN - varmista vastaanottaja ja sisältö ennen kutsua.",
  inputSchema: {
    type: "object" as const,
    properties: {
      recipient: {
        type: "string",
        description:
          "Phone number with country code (e.g. 358401234567) or group JID",
      },
      message: {
        type: "string",
        description: "Message text to send",
        maxLength: 4096,
      },
      is_group: {
        type: "boolean",
        description: "Set to true if recipient is a group JID",
        default: false,
      },
    },
    required: ["recipient", "message"],
  },
};

export async function handler(args: unknown) {
  const { recipient, message, is_group } = SendWhatsAppMessageSchema.parse(
    args
  );
  await sendMessage(recipient, message, is_group);
  return {
    content: [
      {
        type: "text" as const,
        text: `Viesti lähetetty onnistuneesti vastaanottajalle: ${recipient}`,
      },
    ],
  };
}
