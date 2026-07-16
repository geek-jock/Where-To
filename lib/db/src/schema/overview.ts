import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tripsTable } from "./trips";
import { groupDecisionsTable } from "./group-decisions";

export const tripOverviewNotesTable = pgTable("trip_overview_notes", {
  tripId: integer("trip_id")
    .primaryKey()
    .references(() => tripsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  tripId: integer("trip_id")
    .notNull()
    .references(() => tripsTable.id, { onDelete: "cascade" }),
  decisionId: integer("decision_id").references(() => groupDecisionsTable.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TripOverviewNotes = typeof tripOverviewNotesTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
