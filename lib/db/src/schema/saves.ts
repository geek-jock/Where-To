import { pgTable, serial, text, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savesTable = pgTable("saves", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  url: text("url"),
  scrapedTitle: text("scraped_title"),
  scrapedDescription: text("scraped_description"),
  scrapedImage: text("scraped_image"),
  placeName: text("place_name"),
  countryCode: text("country_code"),
  lat: real("lat"),
  lng: real("lng"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSaveSchema = createInsertSchema(savesTable).omit({ id: true, createdAt: true });
export type InsertSave = z.infer<typeof insertSaveSchema>;
export type Save = typeof savesTable.$inferSelect;
