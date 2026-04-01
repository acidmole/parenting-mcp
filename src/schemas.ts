import { z } from "zod";

export const GetWilmaSummarySchema = z.object({
  days: z
    .number()
    .min(1)
    .max(30)
    .default(7)
    .describe("Number of days to include in summary (default 7)"),
});

export const GetWilmaScheduleSchema = z.object({
  when: z
    .enum(["today", "tomorrow", "week"])
    .optional()
    .describe("Shorthand: today, tomorrow, or week"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional()
    .describe("Specific date in YYYY-MM-DD format (overrides 'when')"),
});

export const GetWilmaExamsSchema = z.object({
  days_ahead: z
    .number()
    .min(1)
    .max(90)
    .default(7)
    .describe("Number of days ahead to look for exams (default 7)"),
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of exams to return"),
});

export const GetWilmaHomeworkSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of homework items to return"),
});

export const GetWilmaNewsSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of news items to return"),
});

export const GetWilmaMessagesSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(50)
    .default(20)
    .describe("Maximum number of messages to return"),
  folder: z
    .string()
    .default("inbox")
    .describe("Message folder (default: inbox)"),
});

export const SendWhatsAppMessageSchema = z.object({
  recipient: z
    .string()
    .describe(
      "Phone number with country code (e.g. 358401234567) or group JID"
    ),
  message: z
    .string()
    .max(4096, "Message too long")
    .describe("Message text to send"),
  is_group: z
    .boolean()
    .default(false)
    .describe("Set to true if recipient is a group JID"),
});

export const ListWhatsAppContactsSchema = z.object({
  search: z
    .string()
    .optional()
    .describe("Optional search filter for contact name"),
});

export const ListWhatsAppGroupsSchema = z.object({});

export const SendDailySummarySchema = z.object({
  group_jid: z
    .string()
    .describe("WhatsApp group JID to send the daily summary to"),
});

export const SendWeeklySummarySchema = z.object({
  group_jid: z
    .string()
    .describe("WhatsApp group JID to send the weekly summary to"),
});
