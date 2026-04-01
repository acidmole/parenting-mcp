#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Wilma tools
import * as wilmaSummary from "./tools/wilma-summary.js";
import * as wilmaSchedule from "./tools/wilma-schedule.js";
import * as wilmaExams from "./tools/wilma-exams.js";
import * as wilmaHomework from "./tools/wilma-homework.js";
import * as wilmaNews from "./tools/wilma-news.js";

// WhatsApp tools
import * as whatsappSend from "./tools/whatsapp-send.js";
import * as whatsappContacts from "./tools/whatsapp-contacts.js";
import * as whatsappGroups from "./tools/whatsapp-groups.js";

// Summary tools
import * as dailySummary from "./tools/daily-summary.js";
import * as weeklySummary from "./tools/weekly-summary.js";

const tools = [
  wilmaSummary,
  wilmaSchedule,
  wilmaExams,
  wilmaHomework,
  wilmaNews,
  whatsappSend,
  whatsappContacts,
  whatsappGroups,
  dailySummary,
  weeklySummary,
];

const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

const server = new Server(
  { name: "parenting-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((t) => t.definition),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolMap.get(name);

  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }

  try {
    return await tool.handler(args);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("parenting-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
