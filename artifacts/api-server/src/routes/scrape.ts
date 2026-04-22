import { Router } from "express";
import { getAuth } from "@clerk/express";

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

function parseDescription(raw: string | null): string | null {
  if (!raw) return null;

  let text = decodeEntities(raw);

  // Instagram: "[Page] on Instagram: "caption" N likes, N comments - user on date: "caption""
  // Extract just the first caption, drop the duplicated tail
  const igMatch = text.match(/^.+?\bon Instagram:\s*"([\s\S]+?)"\s*(?:\d[\d,]*\s+like|\.|$)/i);
  if (igMatch) return igMatch[1].trim();

  // Facebook: "[Page] on Facebook: "caption""
  const fbMatch = text.match(/^.+?\bon Facebook:\s*"([\s\S]+?)"\s*(?:\d[\d,]*\s+like|\.|$)/i);
  if (fbMatch) return fbMatch[1].trim();

  // TikTok: "username · N.NM views · caption #hashtags"
  const ttMatch = text.match(/^.+?·\s*[\d.,]+\s*[KMBkmb]?\s*views?\s*·\s*([\s\S]+)/i);
  if (ttMatch) return ttMatch[1].trim();

  // YouTube: strip "N views" / "N watching" style suffix lines
  text = text.replace(/\s*\d[\d,]*\s+(?:views?|watching|subscribers?)[^\n]*/gi, "").trim();

  // Strip trailing social engagement metadata: "N likes, N comments - username on date: ..."
  text = text.replace(/\s*\d[\d,]*\s+likes?,\s*\d+\s+comments?[\s\S]*$/i, "").trim();

  // Deduplicate: if the string contains a long repeated block, keep only the first occurrence
  // Matches platform patterns where description is echoed after engagement stats
  if (text.length > 120) {
    const half = Math.ceil(text.length * 0.48);
    const firstChunk = text.slice(0, half).trim();
    if (text.includes(firstChunk.slice(0, 80)) && text.lastIndexOf(firstChunk.slice(0, 80)) > half) {
      text = firstChunk;
    }
  }

  // Remove wrapping quotes left over from extraction
  text = text.replace(/^["'"]+|["'"]+\.?$/g, "").trim();

  return text || null;
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

    const rawTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
      || null;

    const rawDescription = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]
      || null;

    const image = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || null;
    const siteName = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i)?.[1] || null;

    return {
      url,
      title: rawTitle ? decodeEntities(rawTitle).trim() : null,
      description: parseDescription(rawDescription),
      image,
      siteName,
    };
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
