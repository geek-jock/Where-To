import { Router } from "express";
import { getAuth } from "@clerk/express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

/** Pull visible text from a page's body, preferring <p> content */
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

  return stripped
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

/**
 * Combine all raw scraped pieces into one description string, then clean it.
 * The description is the source of truth — title is derived from it by AI.
 */
function buildRawDescription(parts: (string | null | undefined)[]): string {
  const pieces = parts
    .filter(Boolean)
    .map(p => decodeEntities(p!).trim())
    .filter(p => p.length > 0);

  if (pieces.length === 0) return "";

  let combined = pieces.join("\n");

  // Strip Instagram/TikTok/Facebook handle boilerplate from line starts
  combined = combined.replace(/^.+?\bon (?:Instagram|Facebook|TikTok):\s*/gim, "");

  // Remove wrapping quotes left by extraction
  combined = combined.replace(/^["'"]+|["'"]+\.?$/g, "").trim();

  // Collect social noise tokens (keep them for the footer) then remove from body
  const noisePattern = /\d[\d,.]*[KkMmBb]?\s*(?:likes?|views?|comments?|shares?|followers?|subscribers?|reposts?|saves?|reactions?)(?:\s+\S+)*/gi;
  const noiseMatches: string[] = [];
  const cleanBody = combined.replace(noisePattern, (match) => {
    noiseMatches.push(match.trim());
    return "";
  }).replace(/\s{2,}/g, " ").trim();

  // Deduplicate lines in the clean body
  const seen = new Set<string>();
  const deduped = cleanBody.split(/\n+/).filter(line => {
    const key = line.slice(0, 60).toLowerCase().trim();
    if (key.length < 10) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join("\n").trim();

  // Deduplicate noise tokens and append at end
  const uniqueNoise = [...new Set(noiseMatches.map(n => n.replace(/\s+/g, " ")))];
  const footer = uniqueNoise.length > 0 ? `\n\n— ${uniqueNoise.join(" · ")}` : "";

  return (deduped + footer).slice(0, 900);
}

/** AI generates a short editorial title from the cleaned description */
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
        {
          role: "user",
          content: `URL: ${url}\n\nDescription:\n${description.slice(0, 500)}`,
        },
      ],
      max_tokens: 30,
      temperature: 0.35,
    });
    const title = completion.choices[0]?.message?.content?.trim() ?? null;
    return title || null;
  } catch {
    return null;
  }
}

async function scrapeUrl(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WhereTo/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { url, title: null, description: null, image: null, siteName: null };
    }

    const html = await response.text();

    // Extract all raw pieces
    const rawTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
      || null;

    const rawMetaDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]
      || null;

    const image = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || null;
    const siteName = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i)?.[1] || null;

    const bodyText = extractBodyText(html);

    // Combine ALL scraped content into description, then clean
    const description = buildRawDescription([rawMetaDesc, bodyText]) || null;

    // AI reads the clean body only (strip the noise footer before sending to AI)
    const descriptionForTitle = description?.split("\n\n—")[0].trim() ?? rawTitle ?? "";
    const aiTitle = await generateTitle(descriptionForTitle, url);
    const title = aiTitle ?? (rawTitle ? decodeEntities(rawTitle).trim() : null);

    return { url, title, description, image, siteName };
  } catch {
    return { url, title: null, description: null, image: null, siteName: null };
  }
}

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    const result = await scrapeUrl(url);
    return res.json(result);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to scrape URL" });
  }
});

export default router;
