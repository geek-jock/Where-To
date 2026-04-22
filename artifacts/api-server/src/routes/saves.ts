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
    return res.json(saves);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list saves" });
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
    return res.status(201).json(save);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create save" });
  }
});

router.patch("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { scrapedTitle, scrapedDescription, scrapedImage, placeName, content } = req.body;

    const updateFields: Record<string, unknown> = {};
    if ("scrapedTitle" in req.body) updateFields.scrapedTitle = scrapedTitle ?? null;
    if ("scrapedDescription" in req.body) updateFields.scrapedDescription = scrapedDescription ?? null;
    if ("scrapedImage" in req.body) updateFields.scrapedImage = scrapedImage ?? null;
    if ("content" in req.body) updateFields.content = content ?? null;

    // If placeName is being updated, re-geocode from the new name
    if ("placeName" in req.body && placeName) {
      updateFields.placeName = placeName;
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1&addressdetails=1`;
        const nominatimRes = await fetch(nominatimUrl, {
          headers: { "User-Agent": "WhereTo/1.0 (travel decision app)" },
        });
        type NominatimHit = { lat: string; lon: string; address?: { country_code?: string; city?: string; town?: string; county?: string; state?: string; country?: string } };
        const nominatimData = (await nominatimRes.json()) as NominatimHit[];
        const hit = nominatimData[0];
        if (hit) {
          updateFields.lat = parseFloat(hit.lat);
          updateFields.lng = parseFloat(hit.lon);
          updateFields.countryCode = hit.address?.country_code?.toUpperCase() ?? null;
        }
      } catch {
        // geocode failure is non-fatal
      }
    } else if ("placeName" in req.body && !placeName) {
      updateFields.placeName = null;
      updateFields.lat = null;
      updateFields.lng = null;
      updateFields.countryCode = null;
    }

    const [updated] = await db
      .update(savesTable)
      .set(updateFields)
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update save" });
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
      max_completion_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "Extract the single most specific real-world place from the text. " +
            "Reply with ONLY the place in 'Neighbourhood/Landmark, City, Country' format — always include city and country if known. " +
            "If the place is a small town or attraction, use 'Name, State/Region, Country'. " +
            "If no place is identifiable, reply with exactly: NONE",
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
    type NominatimHit = {
      lat: string;
      lon: string;
      display_name: string;
      address?: {
        country_code?: string;
        country?: string;
        city?: string;
        town?: string;
        village?: string;
        county?: string;
        state?: string;
      };
    };
    const nominatimData = (await nominatimRes.json()) as NominatimHit[];

    const hit = nominatimData[0];
    const lat = hit ? parseFloat(hit.lat) : null;
    const lng = hit ? parseFloat(hit.lon) : null;
    const countryCode = hit?.address?.country_code?.toUpperCase() ?? null;

    // Build a rich place name from address components
    let richPlaceName = placeName;
    if (hit?.address) {
      const addr = hit.address;
      const locality = addr.city || addr.town || addr.village || addr.county;
      const region = addr.state;
      const country = addr.country;
      const parts = [locality, region, country].filter(Boolean);
      if (parts.length >= 2) {
        // If GPT's name is more specific than locality, prefix it
        const gptParts = placeName.split(",").map((s: string) => s.trim());
        const gptFirst = gptParts[0];
        const localityMatch = locality && gptFirst.toLowerCase().includes(locality.toLowerCase());
        richPlaceName = !localityMatch && gptFirst
          ? [gptFirst, ...parts].join(", ")
          : parts.join(", ");
      }
    }

    const [updated] = await db
      .update(savesTable)
      .set({
        placeName: hit ? richPlaceName : null,
        countryCode,
        lat,
        lng,
      })
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)))
      .returning();

    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to geocode save" });
  }
});

router.delete("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(savesTable).where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)));
    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to delete save" });
  }
});

export default router;
