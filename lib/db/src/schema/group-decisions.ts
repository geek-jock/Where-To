import { pgTable, serial, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tripsTable } from "./trips";
import { verdictJsonSchema } from "./decisions";

export const groupVerdictJsonSchema = verdictJsonSchema.extend({
  whoGetsWhat: z.array(
    z.object({
      userId: z.string(),
      memberName: z.string(),
      assignment: z.string(),
    })
  ),
  theSeam: z.string(),
});

export type GroupVerdictJson = z.infer<typeof groupVerdictJsonSchema>;

export const groupDecisionsTable = pgTable("group_decisions", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id")
    .notNull()
    .references(() => tripsTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  status: text("status").notNull().default("undecided"),
  verdictJson: jsonb("verdict_json").$type<GroupVerdictJson>(),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by").notNull(),
  costPerPax: text("cost_per_pax"),
  confirmationLink: text("confirmation_link"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const decisionCommentsTable = pgTable("decision_comments", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id")
    .notNull()
    .references(() => groupDecisionsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GroupDecision = typeof groupDecisionsTable.$inferSelect;
export type DecisionComment = typeof decisionCommentsTable.$inferSelect;
