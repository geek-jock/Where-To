function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export function parseDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let text = decodeEntities(raw);

  // Instagram / Facebook: "[Page] on Instagram: "caption" N likes…"
  const igMatch = text.match(/^.+?\bon (?:Instagram|Facebook):\s*"([\s\S]+?)"\s*(?:\d[\d,]*\s+like|\.|$)/i);
  if (igMatch) return igMatch[1].trim();

  // TikTok: "username · N.NM views · caption"
  const ttMatch = text.match(/^.+?·\s*[\d.,]+\s*[KMBkmb]?\s*views?\s*·\s*([\s\S]+)/i);
  if (ttMatch) return ttMatch[1].trim();

  // Strip "N views" / engagement lines (YouTube etc.)
  text = text.replace(/\s*\d[\d,]*\s+(?:views?|watching|subscribers?)[^\n]*/gi, "").trim();

  // Strip trailing engagement metadata
  text = text.replace(/\s*\d[\d,]*\s+likes?,\s*\d+\s+comments?[\s\S]*$/i, "").trim();

  // Deduplicate: if a long chunk repeats later in the string, keep only the first occurrence
  if (text.length > 120) {
    const probe = text.slice(0, 80);
    const secondOccurrence = text.indexOf(probe, 80);
    if (secondOccurrence !== -1) {
      text = text.slice(0, secondOccurrence).trim();
    }
  }

  // Strip wrapping quotes left by extraction
  text = text.replace(/^["'"]+|["'"]+\.?$/g, "").trim();

  return text || null;
}
