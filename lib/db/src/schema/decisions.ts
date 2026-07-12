import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verdictJsonSchema = z.object({
  verdict: z.string(),
  travelPatterns: z.tuple([z.string(), z.string(), z.string()]),
  coreConflict: z.string(),
  whatYoureMissing: z.string(),
  whyThisFits: z.string(),
  tradeoffs: z.string(),
  avoidIf: z.array(z.string()),
  nextMove: z.string(),
  anchors: z.tuple([z.string(), z.string(), z.string()]),
  timingConfidence: z.string(),
  stopDoingThis: z.string(),
  usedSaveIds: z.array(z.number()),
});

export type VerdictJson = z.infer<typeof verdictJsonSchema>;

export const decisionsTable = pgTable("decisions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  question: text("question").notNull(),
  result: text("result").notNull(),
  resultJson: jsonb("result_json").$type<VerdictJson>(),
  savesSnapshot: text("saves_snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDecisionSchema = createInsertSchema(decisionsTable).omit({ id: true, createdAt: true });
export type InsertDecision = z.infer<typeof insertDecisionSchema>;
export type Decision = typeof decisionsTable.$inferSelect;
