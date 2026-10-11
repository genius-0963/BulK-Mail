import { relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const campaignsTable = pgTable(
  "campaigns",
  {
    id: varchar("id", { length: 100 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    senderEmail: varchar("sender_email", { length: 255 }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    hasAttachment: boolean("has_attachment").default(false).notNull(),
    attachmentFilename: varchar("attachment_filename", { length: 255 }),
    attachmentContentType: varchar("attachment_content_type", { length: 100 }),
    attachmentContentBase64: text("attachment_content_base64"),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    state: varchar("state", { length: 50 }).default("sending").notNull(), // 'sending' | 'paused' | 'completed'
    totalCount: integer("total_count").default(0).notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    failedCount: integer("failed_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("campaigns_user_id_idx").on(table.userId),
    index("campaigns_input_hash_idx").on(table.inputHash),
  ],
);

export const campaignRecipientsTable = pgTable(
  "campaign_recipients",
  {
    id: serial("id").primaryKey(),
    campaignId: varchar("campaign_id", { length: 100 })
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).default("queued").notNull(), // 'queued' | 'sending' | 'sent' | 'failed'
    messageId: varchar("message_id", { length: 255 }),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("campaign_recipients_campaign_id_idx").on(table.campaignId),
  ],
);

export const campaignsRelations = relations(campaignsTable, ({ many }) => ({
  recipients: many(campaignRecipientsTable),
}));

export const campaignRecipientsRelations = relations(
  campaignRecipientsTable,
  ({ one }) => ({
    campaign: one(campaignsTable, {
      fields: [campaignRecipientsTable.campaignId],
      references: [campaignsTable.id],
    }),
  }),
);

export const insertCampaignSchema = createInsertSchema(campaignsTable);
export const selectCampaignSchema = createSelectSchema(campaignsTable);
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;

export const insertCampaignRecipientSchema = createInsertSchema(campaignRecipientsTable);
export const selectCampaignRecipientSchema = createSelectSchema(campaignRecipientsTable);
export type InsertCampaignRecipient = z.infer<typeof insertCampaignRecipientSchema>;
export type CampaignRecipientRecord = typeof campaignRecipientsTable.$inferSelect;
