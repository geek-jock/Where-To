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

const SHARED_JSON_SCHEMA = `{
  "type": "choose" | "structure",
  "verdict": "...",
  "travelPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "coreConflict": "...",
  "whatYoureMissing": "...",
  "whyThisFits": "...",
  "tradeoffs": "...",
  "avoidIf": ["condition 1", "condition 2"],
  "nextMove": "...",
  "anchors": ["anchor 1", "anchor 2", "anchor 3"],
  "timingConfidence": "...",
  "stopDoingThis": "...",
  "usedSaveIds": [1, 2, 3]
}`;

const CHOOSE_SYSTEM_PROMPT = `You are a travel decision engine. The user is choosing between specific destinations or options. Pick exactly one and be direct about why the other(s) lose.

You MUST return ONLY valid JSON — no prose, no markdown, no backticks, no wrapper text. Just the raw JSON object.

The JSON must have exactly these fields:

${SHARED_JSON_SCHEMA}

RULES FOR CHOOSE VERDICTS:
- "type" must be "choose".
- "verdict": Name the winning destination or option only — e.g. "Patagonia in March" or "Sicily over Tokyo".
- "whyThisFits": Explain exactly why this option wins for this user's pattern. Be specific to their saves.
- "tradeoffs": MUST name the losing option explicitly. Format: "Why not [losing option]: ..." followed by what you give up. This is not generic — it directly addresses the alternative.
- "anchors": 3 areas or districts within the chosen destination to base yourself.
- "avoidIf": Conditions under which the chosen option fails.
- Be decisive. Do not hedge. Do not suggest both are great.
- travelPatterns must have exactly 3 items.
- anchors must have exactly 3 items.
- usedSaveIds must list the IDs of saves you actually used.
- Do not use emojis.
- Return ONLY the JSON object, nothing else.`;

const STRUCTURE_SYSTEM_PROMPT = `You are a travel decision engine. The user wants to structure a trip — they have a destination (or cluster of places) and need an order of operations: which place first, how many days, why that sequence.

You MUST return ONLY valid JSON — no prose, no markdown, no backticks, no wrapper text. Just the raw JSON object.

The JSON must have exactly these fields:

${SHARED_JSON_SCHEMA}

RULES FOR STRUCTURE VERDICTS:
- "type" must be "structure".
- "verdict": Name the trip structure as a sequence — e.g. "Tokyo → Hakone → Kyoto" or "3 days Lisbon, 4 days Alentejo, 2 days Porto". This is the headline order of operations.
- "whyThisFits": Explain the sequence logic — why this order, why these day counts, how it flows with the user's travel style from their saves.
- "tradeoffs": Address what breaks if they deviate from this order — e.g. "Skipping Hakone collapses the pacing — you'll arrive in Kyoto too wired from Tokyo." Be specific.
- "anchors": The 3 key zones, clusters, or bases within the structured itinerary (one per leg if possible).
- "avoidIf": Conditions that would break this trip structure (wrong season, too few days, etc.).
- "nextMove": One concrete booking or planning action that locks in the sequence.
- Be decisive about the sequence. Do not offer alternatives.
- travelPatterns must have exactly 3 items.
- anchors must have exactly 3 items.
- usedSaveIds must list the IDs of saves you actually used.
- Do not use emojis.
- Return ONLY the JSON object, nothing else.`;

async function classifyQuestion(question: string): Promise<"choose" | "structure"> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 64,
      messages: [
        {
          role: "system",
          content: `Classify the travel question as either "choose" or "structure".
- "choose": The user is deciding between two or more specific destinations or options (e.g. "Sicily vs Patagonia", "Should I go to Tokyo or Bali?").
- "structure": The user wants to plan the sequence, pacing, or itinerary of a trip to a place or combination of places (e.g. "Tokyo + ryokan + 7 days", "How do I structure a Japan trip?", "Best order for Tokyo, Kyoto, Osaka?").

Return ONLY a JSON object: { "type": "choose" } or { "type": "structure" }. No other text.`,
        },
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    if (parsed.type === "choose" || parsed.type === "structure") {
      return parsed.type;
    }
  } catch {
  }
  return "choose";
}

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

    const questionType = await classifyQuestion(question);
    req.log.info({ questionType }, "Classified question type");

    const systemPrompt = questionType === "structure" ? STRUCTURE_SYSTEM_PROMPT : CHOOSE_SYSTEM_PROMPT;
    const userPrompt = `User travel saves:\n${savesSnapshot}\n\nUser question:\n${question}`;

    const callModel = async () => openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
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
