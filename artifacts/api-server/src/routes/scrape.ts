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

function cleanMetaDescription(raw: string | null): string | null {
  if (!raw) return null;

  let text = decodeEntities(raw);

  // Instagram caption
  const igMatch = text.match(/^.+?\bon Instagram:\s*"([\s\S]+?)"\s*(?:\d[\d,]*\s+like|\.|$)/i);
  if (igMatch) return igMatch[1].trim();

  // Facebook caption
  const fbMatch = text.match(/^.+?\bon Facebook:\s*"([\s\S]+?)"\s*(?:\d[\d,]*\s+like|\.|$)/i);
  if (fbMatch) return fbMatch[1].trim();

  // TikTok: "username · N.NM views · caption"
  const ttMatch = text.match(/^.+?·\s*[\d.,]+\s*[KMBkmb]?\s*views?\s*·\s*([\s\S]+)/i);
  if (ttMatch) return ttMatch[1].trim();

  // Strip view/engagement counts
  text = text.replace(/\s*\d[\d,]*\s+(?:views?|watching|subscribers?)[^\n]*/gi, "").trim();
  text = text.replace(/\s*\d[\d,]*\s+likes?,\s*\d+\s+comments?[\s\S]*$/i, "").trim();

  // Deduplicate repeated content
  if (text.length > 120) {
    const half = Math.ceil(text.length * 0.48);
    const firstChunk = text.slice(0, half).trim();
    if (text.includes(firstChunk.slice(0, 80)) && text.lastIndexOf(firstChunk.slice(0, 80)) > half) {
      text = firstChunk;
    }
  }

  text = text.replace(/^["'"]+|["'"]+\.?$/g, "").trim();
  return text || null;
}

function extractBodyText(html: string): string | null {
  // Remove scripts, styles, nav, header, footer
  let stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Extract text from <p> tags first (most meaningful content)
  const pMatches = [...stripped.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  if (pMatches.length > 0) {
    const paragraphs = pMatches
      .map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(p => p.length > 30);
    if (paragraphs.length > 0) {
      return paragraphs.slice(0, 3).join(" ").slice(0, 500);
    }
  }

  // Fall back to stripping all tags
  const plain = stripped
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 50 ? plain.slice(0, 500) : null;
}

async function generateTitleAndDescription(
  rawDescription: string | null,
  rawTitle: string | null,
  bodyText: string | null,
  url: string,
): Promise<{ title: string | null; description: string | null }> {
  const hasDescription = !!(rawDescription || bodyText);
  const contextParts = [
    rawTitle ? `Page title: ${rawTitle}` : null,
    rawDescription ? `Meta description: ${rawDescription.slice(0, 400)}` : null,
    !rawDescription && bodyText ? `Page content: ${bodyText.slice(0, 400)}` : null,
    `URL: ${url}`,
  ].filter(Boolean);

  if (!contextParts.length) return { title: null, description: null };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You help users organize travel saves. Given scraped web content, return a JSON object with:
1. "title": 3–8 word editorial title naming the specific place or experience. Never generic ("Instagram post", "Video"). Name the actual place if identifiable.
2. "description": 1–2 sentence evocative description of what makes this place or experience worth saving. ${hasDescription ? "Distill the key insight from the content." : "Based on the URL and title, write a brief placeholder description."} Keep it under 120 characters.
Reply ONLY with valid JSON: {"title":"...","description":"..."}`,
        },
        { role: "user", content: contextParts.join("\n") },
      ],
      max_tokens: 120,
      temperature: 0.4,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw.replace(/^```json\s*|```\s*$/g, "").trim());
    return {
      title: typeof parsed.title === "string" && parsed.title ? parsed.title : null,
      description: typeof parsed.description === "string" && parsed.description ? parsed.description : null,
    };
  } catch {
    return { title: null, description: null };
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

    const rawTitleRaw = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
      || null;
    const rawTitle = rawTitleRaw ? decodeEntities(rawTitleRaw).trim() : null;

    const rawDescriptionRaw = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]
      || null;
    const rawDescription = cleanMetaDescription(rawDescriptionRaw);

    const image = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || null;
    const siteName = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i)?.[1] || null;

    // Extract body text as fallback description source
    const bodyText = rawDescription ? null : extractBodyText(html);

    // Generate both title and description via AI
    const ai = await generateTitleAndDescription(rawDescription, rawTitle, bodyText, url);

    const title = ai.title ?? rawTitle;
    const description = ai.description ?? rawDescription ?? null;

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
