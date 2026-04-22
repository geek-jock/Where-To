/**
 * One-time backfill: re-runs the scrape pipeline on all seeded saves that have URLs.
 * Updates scrapedTitle and scrapedDescription with the new cleaned content + AI titles.
 *
 * Run: pnpm --filter @workspace/api-server tsx src/scripts/backfill-scrape.ts
 */

import { db, savesTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { isNotNull, eq } from "drizzle-orm";

// ── Scrape helpers (mirrors routes/scrape.ts) ────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function extractBodyText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  const pMatches = [...stripped.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  if (pMatches.length > 0) {
    const paragraphs = pMatches
      .map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(p => p.length > 30);
    if (paragraphs.length > 0) return paragraphs.slice(0, 5).join(" ").slice(0, 600);
  }
  return stripped.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
}

function buildRawDescription(parts: (string | null | undefined)[]): string {
  const pieces = parts.filter(Boolean).map(p => decodeEntities(p!).trim()).filter(p => p.length > 0);
  if (pieces.length === 0) return "";

  let combined = pieces.join("\n");
  combined = combined.replace(/^.+?\bon (?:Instagram|Facebook|TikTok):\s*/gim, "");
  combined = combined.replace(/^["'"]+|["'"]+\.?$/g, "").trim();

  const noisePattern = /\d[\d,.]*[KkMmBb]?\s*(?:likes?|views?|comments?|shares?|followers?|subscribers?|reposts?|saves?|reactions?)(?:\s+\S+)*/gi;
  const noiseMatches: string[] = [];
  const cleanBody = combined.replace(noisePattern, (match) => {
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

async function generateTitle(description: string, url: string): Promise<string | null> {
  if (!description.trim()) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You name travel saves. Given the description of a place or travel experience, return ONLY a title: 3–7 words, specific, editorial, no quotes, no punctuation at the end.
Name the actual place if identifiable (e.g. "Amalfi Coast Cliffside Hotel"). If it's an experience, name the vibe (e.g. "Quiet Ryokan in Kyoto Mountains"). Never use generic titles like "Instagram Post" or "Travel Video".`,
        },
        { role: "user", content: `URL: ${url}\n\nDescription:\n${description.slice(0, 500)}` },
      ],
      max_tokens: 30,
      temperature: 0.35,
    });
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function scrapeOne(url: string): Promise<{ title: string | null; description: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WhereTo/1.0)", "Accept": "text/html,application/xhtml+xml" },
    });
    clearTimeout(timeout);
    if (!response.ok) return { title: null, description: null };

    const html = await response.text();
    const rawTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null;
    const rawMetaDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] || null;
    const bodyText = extractBodyText(html);
    const description = buildRawDescription([rawMetaDesc, bodyText]) || null;
    const cleanForTitle = description?.split("\n\n—")[0].trim() ?? rawTitle ?? "";
    const aiTitle = await generateTitle(cleanForTitle, url);
    const title = aiTitle ?? (rawTitle ? decodeEntities(rawTitle).trim() : null);
    return { title, description };
  } catch (e) {
    console.error(`  ✗ fetch failed: ${e}`);
    return { title: null, description: null };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const saves = await db.select().from(savesTable).where(isNotNull(savesTable.url));
console.log(`\nBackfilling ${saves.length} saves with URLs...\n`);

for (const save of saves) {
  console.log(`[${save.id}] ${save.url}`);
  const { title, description } = await scrapeOne(save.url!);
  console.log(`  title: ${title ?? "(null)"}`);
  console.log(`  desc:  ${(description ?? "").slice(0, 80)}${description && description.length > 80 ? "…" : ""}`);

  await db.update(savesTable).set({
    scrapedTitle: title ?? save.scrapedTitle,
    scrapedDescription: description ?? save.scrapedDescription,
  }).where(eq(savesTable.id, save.id));

  console.log(`  ✓ updated\n`);
  // Small delay to avoid hammering external sites
  await new Promise(r => setTimeout(r, 400));
}

console.log("Done.");
process.exit(0);
