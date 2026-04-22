import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, savesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

router.get("/", requireAuth, async (req: any, res) => {
  try {
    const saves = await db
      .select()
      .from(savesTable)
      .where(eq(savesTable.userId, req.userId))
      .orderBy(savesTable.createdAt);
    res.json(saves);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list saves" });
  }
});

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { content, url, scrapedTitle, scrapedDescription, scrapedImage } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const [save] = await db.insert(savesTable).values({
      userId: req.userId,
      content,
      url: url ?? null,
      scrapedTitle: scrapedTitle ?? null,
      scrapedDescription: scrapedDescription ?? null,
      scrapedImage: scrapedImage ?? null,
    }).returning();
    res.status(201).json(save);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create save" });
  }
});

router.post("/:id/geocode", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const [save] = await db
      .select()
      .from(savesTable)
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)));

    if (!save) return res.status(404).json({ error: "Not found" });

    const textBlob = [
      save.scrapedTitle,
      save.scrapedDescription,
      save.content,
      save.url,
    ].filter(Boolean).join(" | ");

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 64,
      messages: [
        {
          role: "system",
          content:
            "Extract the single most specific real-world place name (city, landmark, neighbourhood, region, or country) from the following text. " +
            "Reply with ONLY the place name, nothing else. If there is no identifiable place, reply with exactly: NONE",
        },
        { role: "user", content: textBlob },
      ],
    });

    const placeName = aiResponse.choices[0]?.message?.content?.trim() ?? "NONE";

    if (!placeName || placeName === "NONE") {
      const [updated] = await db
        .update(savesTable)
        .set({ placeName: null, countryCode: null, lat: null, lng: null })
        .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)))
        .returning();
      return res.json(updated);
    }

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1&addressdetails=1`;
    const nominatimRes = await fetch(nominatimUrl, {
      headers: { "User-Agent": "WhereTo/1.0 (travel decision app)" },
    });
    const nominatimData = (await nominatimRes.json()) as Array<{ lat: string; lon: string; address?: { country_code?: string } }>;

    const hit = nominatimData[0];
    const lat = hit ? parseFloat(hit.lat) : null;
    const lng = hit ? parseFloat(hit.lon) : null;
    const countryCode = hit?.address?.country_code?.toUpperCase() ?? null;

    const [updated] = await db
      .update(savesTable)
      .set({
        placeName: hit ? placeName : null,
        countryCode,
        lat,
        lng,
      })
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to geocode save" });
  }
});

router.delete("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(savesTable).where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete save" });
  }
});

export default router;
