import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, decisionsTable, savesTable } from "@workspace/db";
import { verdictJsonSchema } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

const SYSTEM_PROMPT = `You are a travel decision engine. Analyze the user's saved travel places and their question, then return a single JSON object with your verdict.

You MUST return ONLY valid JSON — no prose, no markdown, no backticks, no wrapper text. Just the raw JSON object.

The JSON must have exactly these fields:

{
  "verdict": "The destination or trip direction name — the big headline decision (e.g. 'Tokyo in April', 'Slow month in Lisbon')",
  "travelPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "coreConflict": "One sentence describing the tension in their saves",
  "whatYoureMissing": "One sentence about an overlooked factor",
  "whyThisFits": "2-3 sentences explaining why this verdict fits their pattern",
  "tradeoffs": "2-3 sentences on what they give up with this choice",
  "avoidIf": ["condition 1", "condition 2"],
  "nextMove": "One concrete action to take today — specific, not generic",
  "anchors": ["Area or district to base yourself", "Key zone or cluster 1", "Key zone or cluster 2"],
  "timingConfidence": "One sentence like 'You won't regret this if you go now because...' or 'This fails if you go in peak summer because...'",
  "stopDoingThis": "One constraint to protect the decision. E.g. 'Stop saving more places' or 'Don't compare more countries'",
  "usedSaveIds": [1, 2, 3]
}

RULES:
- Be decisive. Do not hedge.
- Do not give more than ONE recommendation.
- Do not be generic — base everything on the actual saves provided.
- travelPatterns must have exactly 3 items.
- anchors must have exactly 3 items.
- usedSaveIds must list the IDs of saves you actually used in your analysis.
- Do not use emojis.
- Return ONLY the JSON object, nothing else.`;

router.get("/", requireAuth, async (req: any, res) => {
  try {
    const decisions = await db
      .select()
      .from(decisionsTable)
      .where(eq(decisionsTable.userId, req.userId))
      .orderBy(decisionsTable.createdAt);
    res.json(decisions.reverse());
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list decisions" });
  }
});

router.get("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const [decision] = await db
      .select()
      .from(decisionsTable)
      .where(and(eq(decisionsTable.id, id), eq(decisionsTable.userId, req.userId)));
    if (!decision) return res.status(404).json({ error: "Not found" });
    return res.json(decision);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get decision" });
  }
});

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { question, saveIds } = req.body;
    if (!question) return res.status(400).json({ error: "question is required" });
    if (!saveIds || !Array.isArray(saveIds) || saveIds.length === 0) {
      return res.status(400).json({ error: "saveIds is required and must be non-empty" });
    }

    const saves = await db
      .select()
      .from(savesTable)
      .where(and(
        inArray(savesTable.id, saveIds),
        eq(savesTable.userId, req.userId)
      ));

    const savesSnapshot = saves.map(s => {
      const parts = [`ID:${s.id}`, s.content];
      if (s.scrapedTitle) parts.push(`Title: ${s.scrapedTitle}`);
      if (s.scrapedDescription) parts.push(`Description: ${s.scrapedDescription}`);
      if (s.url) parts.push(`URL: ${s.url}`);
      return parts.join("\n");
    }).join("\n\n---\n\n");

    const userPrompt = `User travel saves:\n${savesSnapshot}\n\nUser question:\n${question}`;

    const callModel = async () => openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const tryParse = (raw: string) => {
      const parsed = JSON.parse(raw);
      return verdictJsonSchema.safeParse(parsed);
    };

    let rawContent = (await callModel()).choices[0]?.message?.content ?? "";
    let validated = tryParse(rawContent);

    if (!validated.success) {
      req.log.warn({ issues: validated.error.issues }, "VerdictJson validation failed on first attempt, retrying");
      rawContent = (await callModel()).choices[0]?.message?.content ?? "";
      validated = tryParse(rawContent);
    }

    if (!validated.success) {
      req.log.error({ issues: validated.error.issues }, "VerdictJson validation failed after retry — refusing to store unstructured verdict");
      return res.status(502).json({ error: "AI returned malformed verdict. Please try again." });
    }

    const resultJson = validated.data;

    const [decision] = await db.insert(decisionsTable).values({
      userId: req.userId,
      question,
      result: rawContent,
      resultJson,
      savesSnapshot,
    }).returning();

    return res.status(201).json(decision);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create decision" });
  }
});

router.post("/select-saves", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string") {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const saves = await db
      .select()
      .from(savesTable)
      .where(eq(savesTable.userId, req.userId));

    if (saves.length === 0) {
      res.json({ saveIds: [] });
      return;
    }

    const saveSummaries = saves.map(s => {
      const label = s.scrapedTitle || s.placeName || (s.content?.slice(0, 80) ?? "");
      const tags = (Array.isArray(s.tags) ? s.tags : []).join(", ");
      const place = s.placeName ?? "";
      return `ID:${s.id} | ${label}${place ? ` | ${place}` : ""}${tags ? ` | tags: ${tags}` : ""}`;
    }).join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 256,
      messages: [
        {
          role: "system",
          content: `You are a travel assistant. Given a user's question and their saved travel items, select the most relevant save IDs (up to 10). Return ONLY a JSON object with a "saveIds" array of integers. No explanation.`,
        },
        {
          role: "user",
          content: `Question: ${question}\n\nSaved items:\n${saveSummaries}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    let selectedIds: number[] = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.saveIds)) {
        selectedIds = parsed.saveIds
          .filter((id: unknown) => typeof id === "number" && Number.isInteger(id))
          .slice(0, 10);
      }
    } catch {
      selectedIds = [];
    }

    const validIds = new Set(saves.map(s => s.id));
    selectedIds = selectedIds.filter(id => validIds.has(id));

    res.json({ saveIds: selectedIds });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to select saves" });
  }
});

router.delete("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(decisionsTable).where(and(eq(decisionsTable.id, id), eq(decisionsTable.userId, req.userId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete decision" });
  }
});

export default router;
