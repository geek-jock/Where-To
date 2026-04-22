import { Router } from "express";
import { getAuth } from "@clerk/express";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
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
      return { url, title: null, description: null, image: null, siteName: null, extractedText: null };
    }

    const html = await response.text();

    const title = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
      || null;

    const description = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
      || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]
      || null;

    const image = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || null;
    const siteName = html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i)?.[1] || null;

    // Extract visible text content (simplified)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    return {
      url,
      title: title?.trim() || null,
      description: description?.trim() || null,
      image,
      siteName,
      extractedText: textContent || null,
    };
  } catch {
    return { url, title: null, description: null, image: null, siteName: null, extractedText: null };
  }
}

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    const result = await scrapeUrl(url);
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to scrape URL" });
  }
});

export default router;
