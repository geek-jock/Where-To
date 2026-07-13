/**
 * Smarter backfill:
 * - Saves with rich descriptions (from real scrape) → clean + AI title
 * - Saves with garbage descriptions (blocked sites) → AI generates both
 *
 * Run: cd artifacts/api-server && node_modules/.bin/esbuild src/scripts/backfill-scrape.ts --bundle --platform=node --format=cjs --outfile=/tmp/backfill.cjs && node /tmp/backfill.cjs
 */

import { db, savesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { isNotNull, eq } from "drizzle-orm";

// ── Noise-moving pipeline ────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function cleanAndOrganizeDescription(raw: string): string {
  let text = decodeEntities(raw).trim();
  text = text.replace(/^.+?\bon (?:Instagram|Facebook|TikTok):\s*/gim, "");
  text = text.replace(/^["'"]+|["'"]+\.?$/g, "").trim();

  const noisePattern = /\d[\d,.]*[KkMmBb]?\s*(?:likes?|views?|comments?|shares?|followers?|subscribers?|reposts?|saves?|reactions?)(?:\s+\S+)*/gi;
  const noiseMatches: string[] = [];
  const cleanBody = text.replace(noisePattern, match => {
    noiseMatches.push(match.trim());
    return "";
  }).replace(/\s{2,}/g, " ").trim();

  const seen = new Set<string>();
  const deduped = cleanBody.split(/\n+/).filter(line => {
    const key = line.slice(0, 60).toLowerCase().trim();
    if (key.length < 10) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join("\n").trim();

  const uniqueNoise = [...new Set(noiseMatches.map(n => n.replace(/\s+/g, " ")))];
  const footer = uniqueNoise.length > 0 ? `\n\n— ${uniqueNoise.join(" · ")}` : "";
  return (deduped + footer).slice(0, 900);
}

// ── AI helpers ───────────────────────────────────────────────────────────────

async function generateTitle(context: string): Promise<string | null> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: `Return ONLY a travel save title: 3–7 words, specific, editorial, no quotes, no trailing punctuation. Name the actual place if identifiable. Never use generic titles like "Instagram Post" or "Travel Video".`,
        },
        { role: "user", content: context.slice(0, 500) },
      ],
      max_tokens: 30,
      temperature: 0.35,
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function generateDescriptionAndTitle(
  placeName: string,
  tags: string[],
  category: string,
  url: string,
): Promise<{ title: string; description: string }> {
  const tagStr = tags.join(", ");
  const prompt = `Place: ${placeName}
Category: ${category}
Vibes: ${tagStr}
Source URL: ${url}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content: `You write concise, evocative travel save descriptions. Given a place name, category, and vibes, return a JSON object:
{
  "title": "3–7 word editorial title naming the specific place",
  "description": "2–3 sentence vivid description of what makes this place worth saving. Practical + poetic. Under 200 characters."
}
Reply ONLY with valid JSON.`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 150,
    temperature: 0.5,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
  const parsed = JSON.parse(raw.replace(/^```json\s*|```\s*$/g, "").trim());
  return {
    title: typeof parsed.title === "string" ? parsed.title : placeName,
    description: typeof parsed.description === "string" ? parsed.description : "",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const GARBAGE_DESCRIPTIONS = new Set([
  "instagram", "tiktok - make your day", "tiktok", "facebook",
  "youtube", "enjoy the videos and music you love",
  "airbnb", "404 page not found",
]);

function isGarbage(desc: string | null): boolean {
  if (!desc || desc.trim().length < 15) return true;
  const lower = desc.toLowerCase().trim();
  for (const g of GARBAGE_DESCRIPTIONS) {
    if (lower.startsWith(g)) return true;
  }
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const saves = await db.select().from(savesTable).where(isNotNull(savesTable.url));
  console.log(`\nBackfilling ${saves.length} saves with URLs...\n`);

  for (const save of saves) {
    console.log(`[${save.id}] ${save.placeName ?? save.url}`);

    const tags: string[] = (() => {
      try { return JSON.parse(save.tags ?? "[]") as string[]; } catch { return []; }
    })();

    let newTitle: string | null = null;
    let newDescription: string | null = null;

    if (isGarbage(save.scrapedDescription)) {
      // Generate both from place context
      console.log(`  → generating from place context (${save.placeName})`);
      try {
        const result = await generateDescriptionAndTitle(
          save.placeName ?? save.url ?? "",
          tags,
          save.category ?? "place",
          save.url ?? "",
        );
        newTitle = result.title;
        newDescription = result.description;
      } catch (e) {
        console.error(`  ✗ AI failed: ${e}`);
      }
    } else {
      // Clean existing rich description, move noise to end
      console.log(`  → cleaning existing description`);
      newDescription = save.scrapedDescription
        ? cleanAndOrganizeDescription(save.scrapedDescription)
        : null;

      // Generate AI title from clean body
      const cleanForTitle = newDescription?.split("\n\n—")[0].trim() ?? save.placeName ?? "";
      newTitle = await generateTitle(
        `Place: ${save.placeName}\n\n${cleanForTitle}`,
      );
    }

    console.log(`  title: ${newTitle ?? "(unchanged)"}`);
    console.log(`  desc:  ${(newDescription ?? "").slice(0, 90)}…`);

    await db.update(savesTable).set({
      scrapedTitle: newTitle ?? save.scrapedTitle,
      scrapedDescription: newDescription ?? save.scrapedDescription,
    }).where(eq(savesTable.id, save.id));

    console.log(`  ✓ done\n`);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log("All done.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
