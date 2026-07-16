import { pgTable, serial, text, timestamp, real, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savesTable = pgTable("saves", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  note: text("note"),
  url: text("url"),
  scrapedTitle: text("scraped_title"),
  description: text("description"),
  placeName: text("place_name"),
  countryCode: text("country_code"),
  lat: real("lat"),
  lng: real("lng"),
  tags: text("tags"),
  category: text("category"),
  officialLink: text("official_link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  travelProfile: text("travel_profile"),
  savesCount: integer("saves_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSaveSchema = createInsertSchema(savesTable).omit({ id: true, createdAt: true });
export type InsertSave = z.infer<typeof insertSaveSchema>;
export type Save = typeof savesTable.$inferSelect;

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ updatedAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;

export const saveShareStatusEnum = pgEnum("save_share_status", ["pending", "accepted", "declined", "revoked"]);

export const saveShareRequestsTable = pgTable("save_share_requests", {
  id: serial("id").primaryKey(),
  fromUserId: text("from_user_id").notNull(),
  toEmail: text("to_email").notNull(),
  toUserId: text("to_user_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SaveShareRequest = typeof saveShareRequestsTable.$inferSelect;
