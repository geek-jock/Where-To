import { db, savesTable } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import OpenAI from "openai";
import "dotenv/config";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type NominatimHit = {
  lat: string;
  lon: string;
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

async function geocone(save: { id: number; scrapedTitle: string | null; scrapedDescription: string | null; content: string; url: string | null }) {
  const textBlob = [save.scrapedTitle, save.scrapedDescription, save.content, save.url]
    .filter(Boolean)
    .join(" | ");

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
  console.log(`  [${save.id}] GPT says: "${placeName}"`);

  if (!placeName || placeName === "NONE") return null;

  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1&addressdetails=1`;
  const nominatimRes = await fetch(nominatimUrl, {
    headers: { "User-Agent": "WhereTo/1.0 (travel decision app)" },
  });
  const nominatimData = (await nominatimRes.json()) as NominatimHit[];
  const hit = nominatimData[0];

  if (!hit) {
    console.log(`  [${save.id}] Nominatim: no results`);
    return null;
  }

  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  const countryCode = hit.address?.country_code?.toUpperCase() ?? null;

  let richPlaceName = placeName;
  if (hit.address) {
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

  console.log(`  [${save.id}] Rich name: "${richPlaceName}" lat=${lat.toFixed(4)} lng=${lng.toFixed(4)} cc=${countryCode}`);
  return { lat, lng, countryCode, richPlaceName };
}

async function main() {
  const saves = await db
    .select()
    .from(savesTable)
    .where(eq(savesTable.userId, "user_3Cgu2zqpMZLeuHoGUtD3t1O6Jjy"));

  console.log(`Re-geocoding ${saves.length} saves...`);

  for (const save of saves) {
    console.log(`\n[${save.id}] "${save.scrapedTitle ?? save.content.slice(0, 60)}"`);
    try {
      const result = await geocone(save);
      if (result) {
        await db
          .update(savesTable)
          .set({
            placeName: result.richPlaceName,
            lat: result.lat,
            lng: result.lng,
            countryCode: result.countryCode,
          })
          .where(eq(savesTable.id, save.id));
        console.log(`  ✓ Updated`);
      } else {
        console.log(`  — Skipped (no place found)`);
      }
      await new Promise(r => setTimeout(r, 1100));
    } catch (err) {
      console.error(`  ✗ Error:`, err);
    }
  }

  console.log("\nDone.");
  process.exit(0);
}

main();
