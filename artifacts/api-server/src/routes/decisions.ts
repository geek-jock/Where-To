import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, decisionsTable, savesTable } from "@workspace/db";
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

const SYSTEM_PROMPT = `You are a travel decision engine.

Your job is to take messy, unstructured travel inputs and convert them into ONE clear travel decision.

Do not give general travel advice.
Do not list many options.
Be specific, structured, and decisive.

---

STEP 1 — Extract Places

From the input, identify as many real places as possible.

For each place, infer:
- city
- country
- type (e.g. cafe, viewpoint, district, nature, etc.)
- vibe (e.g. crowded, aesthetic, quiet, walkable, scenic, etc.)

If exact details are unclear, make reasonable inferences.

---

STEP 2 — Identify Patterns

Analyze all extracted places and identify:

1. Top 3 patterns in what the user prefers
2. One contradiction
3. One missing factor

---

STEP 3 — Cluster Direction

Group the places into 2–3 high-level directions (not too many).

---

STEP 4 — Make a Decision

Based on detected patterns, the user's question, and the clusters, output exactly:

---

Your Travel Patterns:
- [pattern 1]
- [pattern 2]
- [pattern 3]

Your Core Conflict:
[one sentence describing the tension]

What You're Missing:
[one sentence about an overlooked factor]

Your Best Trip Direction:
[Name of destination or trip type]

Why This Fits You:
[2-3 sentences]

Tradeoffs:
[2-3 sentences on what they give up]

Best Time to Go:
[specific timing guidance]

Avoid If:
[1-2 specific conditions]

---

Your Next Move (do this today):
[One concrete action — specific, not generic. E.g. "Lock your travel window between April or May" or "Start with flights to Tokyo, not more research"]

Start Here — 3 Anchors:
1. [Area or district to base yourself]
2. [Key zone or cluster 1]
3. [Key zone or cluster 2]

Timing Confidence:
[One sentence like "You won't regret this if you go now because..." or "This fails if you go in peak summer because..."]

Stop Doing This:
[One constraint to protect the decision. E.g. "Stop saving more places" or "Don't compare more countries"]

If you want, I can turn this into a 3-day structure or map.

---

IMPORTANT RULES:
- Be decisive. Do not hedge.
- Do not give more than ONE recommendation.
- Do not be generic.
- Base everything on the user's input, even if imperfect.
- Keep the total response concise but insightful.
- Do not use emojis.`;

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
    res.json(decision);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to get decision" });
  }
});

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { question, saveIds } = req.body;
    if (!question) return res.status(400).json({ error: "question is required" });
    if (!saveIds || !Array.isArray(saveIds) || saveIds.length === 0) {
      return res.status(400).json({ error: "saveIds is required and must be non-empty" });
    }

    // Fetch the saves
    const saves = await db
      .select()
      .from(savesTable)
      .where(and(
        inArray(savesTable.id, saveIds),
        eq(savesTable.userId, req.userId)
      ));

    // Build snapshot
    const savesSnapshot = saves.map(s => {
      const parts = [s.content];
      if (s.scrapedTitle) parts.push(`Title: ${s.scrapedTitle}`);
      if (s.scrapedDescription) parts.push(`Description: ${s.scrapedDescription}`);
      if (s.url) parts.push(`URL: ${s.url}`);
      return parts.join("\n");
    }).join("\n\n---\n\n");

    const userPrompt = `User travel saves:\n${savesSnapshot}\n\nUser question:\n${question}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const result = response.choices[0]?.message?.content ?? "";

    const [decision] = await db.insert(decisionsTable).values({
      userId: req.userId,
      question,
      result,
      savesSnapshot,
    }).returning();

    res.status(201).json(decision);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create decision" });
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
    let saveIds: number[] = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.saveIds)) {
        saveIds = parsed.saveIds
          .filter((id: unknown) => typeof id === "number" && Number.isInteger(id))
          .slice(0, 10);
      }
    } catch {
      saveIds = [];
    }

    const validIds = new Set(saves.map(s => s.id));
    saveIds = saveIds.filter(id => validIds.has(id));

    res.json({ saveIds });
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
