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

function parseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

function withTags(save: any) {
  return { ...save, tags: parseTags(save.tags) };
}

function buildOfficialLink(category: string | null, placeName: string | null): string | null {
  if (!placeName) return null;
  const q = encodeURIComponent(placeName);
  const cat = (category ?? "").toLowerCase();
  if (cat === "hotel" || cat === "hostel" || cat === "accommodation" || cat === "resort") {
    return `https://www.booking.com/search.html?ss=${q}`;
  }
  if (cat === "restaurant" || cat === "café" || cat === "cafe" || cat === "bar" || cat === "food") {
    return `https://www.google.com/maps/search/${q}+restaurant`;
  }
  if (cat === "attraction" || cat === "museum" || cat === "gallery" || cat === "landmark") {
    return `https://www.tripadvisor.com/Search?q=${q}`;
  }
  if (cat === "park" || cat === "beach" || cat === "nature" || cat === "reserve") {
    return `https://www.google.com/maps/search/${q}`;
  }
  // Default: Google Maps search
  return `https://www.google.com/maps/search/${q}`;
}

router.get("/", requireAuth, async (req: any, res) => {
  try {
    const saves = await db
      .select()
      .from(savesTable)
      .where(eq(savesTable.userId, req.userId))
      .orderBy(savesTable.createdAt);
    return res.json(saves.map(withTags));
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
    return res.status(201).json(withTags(save));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create save" });
  }
});

router.patch("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { scrapedTitle, scrapedDescription, scrapedImage, placeName, content, tags, category, officialLink } = req.body;

    const updateFields: Record<string, unknown> = {};
    if ("scrapedTitle" in req.body) updateFields.scrapedTitle = scrapedTitle ?? null;
    if ("scrapedDescription" in req.body) updateFields.scrapedDescription = scrapedDescription ?? null;
    if ("scrapedImage" in req.body) updateFields.scrapedImage = scrapedImage ?? null;
    if ("content" in req.body) updateFields.content = content ?? null;
    if ("tags" in req.body) updateFields.tags = tags ? JSON.stringify(tags) : null;
    if ("category" in req.body) updateFields.category = category ?? null;
    if ("officialLink" in req.body) updateFields.officialLink = officialLink ?? null;

    if ("placeName" in req.body && placeName) {
      updateFields.placeName = placeName;
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1&addressdetails=1`;
        const nominatimRes = await fetch(nominatimUrl, {
          headers: { "User-Agent": "WhereTo/1.0 (travel decision app)" },
        });
        type NominatimHit = { lat: string; lon: string; address?: { country_code?: string } };
        const nominatimData = (await nominatimRes.json()) as NominatimHit[];
        const hit = nominatimData[0];
        if (hit) {
          updateFields.lat = parseFloat(hit.lat);
          updateFields.lng = parseFloat(hit.lon);
          updateFields.countryCode = hit.address?.country_code?.toUpperCase() ?? null;
        }
      } catch { /* non-fatal */ }
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
    return res.json(withTags(updated));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update save" });
  }
});

router.post("/:id/tag", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const [save] = await db
      .select()
      .from(savesTable)
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)));

    if (!save) return res.status(404).json({ error: "Not found" });

    const blob = [save.scrapedTitle, save.scrapedDescription, save.content, save.placeName]
      .filter(Boolean).join(" | ");

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "Analyze this travel place and return a JSON object with two fields:\n" +
            "1. \"tags\": 3-4 lowercase descriptive tags. Choose from:\n" +
            "   VIBE: coastal, mountain, desert, jungle, island, city, countryside, village\n" +
            "   TYPE: nature, foodie, cultural, adventure, wellness, nightlife, architecture, history\n" +
            "   FEEL: romantic, solo-friendly, off-beat, iconic, underrated, busy, peaceful\n" +
            "   LOGISTICS: budget-friendly, luxury, road-trip, hiking\n" +
            "2. \"category\": ONE word classifying the place type. Choose from:\n" +
            "   hotel, hostel, resort, restaurant, café, bar, attraction, museum, gallery,\n" +
            "   landmark, park, beach, neighborhood, experience, activity, viewpoint, market, spa\n" +
            "Reply ONLY with a JSON object, e.g. {\"tags\":[\"coastal\",\"iconic\"],\"category\":\"attraction\"}",
        },
        { role: "user", content: blob },
      ],
    });

    const raw = aiResponse.choices[0]?.message?.content?.trim() ?? "{}";
    let tags: string[] = [];
    let category: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.tags && Array.isArray(parsed.tags)) tags = parsed.tags.map(String).slice(0, 5);
      if (parsed.category && typeof parsed.category === "string") category = parsed.category.toLowerCase();
    } catch { /* keep defaults */ }

    const officialLink = buildOfficialLink(category, save.placeName);

    const [updated] = await db
      .update(savesTable)
      .set({ tags: JSON.stringify(tags), category, officialLink })
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)))
      .returning();

    return res.json(withTags(updated));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to tag save" });
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

    const textBlob = [save.scrapedTitle, save.scrapedDescription, save.content, save.url]
      .filter(Boolean).join(" | ");

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      max_completion_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "Extract the real-world location from the text. Be aggressive — even for niche lodges, resorts, or attractions, extract the nearest identifiable geographic place.\n\n" +
            "Format: 'Landmark/Neighbourhood, City/Town, Country' — always include country.\n" +
            "If the specific venue isn't geocodable (private lodge, small resort), use its nearest town or region: 'Town, State/Region, Country'.\n" +
            "If you know the country but not the city, use: 'Region, Country'.\n" +
            "Only reply 'NONE' if there is absolutely no geographic information whatsoever.",
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
      return res.json(withTags(updated));
    }

    type NominatimHit = {
      lat: string; lon: string; display_name: string;
      address?: { country_code?: string; country?: string; city?: string; town?: string; village?: string; county?: string; state?: string };
    };

    async function nominatimSearch(query: string): Promise<NominatimHit | null> {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
      const res = await fetch(url, { headers: { "User-Agent": "WhereTo/1.0 (travel decision app)" } });
      const data = (await res.json()) as NominatimHit[];
      return data[0] ?? null;
    }

    // Try full query first, then progressively strip leading component (venue name)
    let hit = await nominatimSearch(placeName);
    if (!hit) {
      const parts = placeName.split(",").map((p: string) => p.trim());
      if (parts.length > 2) {
        // Try without the first part (e.g. skip specific lodge name, search city + country)
        hit = await nominatimSearch(parts.slice(1).join(", "));
      }
      if (!hit && parts.length > 1) {
        // Last resort: just the last two parts (region + country)
        hit = await nominatimSearch(parts.slice(-2).join(", "));
      }
    }

    const lat = hit ? parseFloat(hit.lat) : null;
    const lng = hit ? parseFloat(hit.lon) : null;
    const countryCode = hit?.address?.country_code?.toUpperCase() ?? null;

    let richPlaceName = placeName;
    if (hit?.address) {
      const addr = hit.address;
      const locality = addr.city || addr.town || addr.village || addr.county;
      const region = addr.state;
      const country = addr.country;
      const parts = [locality, region, country].filter(Boolean);
      if (parts.length >= 2) {
        const gptFirst = placeName.split(",")[0].trim();
        const localityMatch = locality && gptFirst.toLowerCase().includes(locality.toLowerCase());
        richPlaceName = !localityMatch && gptFirst ? [gptFirst, ...parts].join(", ") : parts.join(", ");
      }
    }

    const [updated] = await db
      .update(savesTable)
      .set({ placeName: hit ? richPlaceName : placeName, countryCode, lat, lng })
      .where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)))
      .returning();

    return res.json(withTags(updated));
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
