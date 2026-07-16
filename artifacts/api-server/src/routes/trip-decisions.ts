import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  groupDecisionsTable,
  decisionCommentsTable,
  tripMembersTable,
  tripsTable,
  savesTable,
  userProfilesTable,
  groupVerdictJsonSchema,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router({ mergeParams: true });

function getOptionalAuth(req: any): string | null {
  try {
    return getAuth(req)?.userId ?? null;
  } catch {
    return null;
  }
}

function requireAuth(req: any, res: any, next: any) {
  const userId = getOptionalAuth(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

async function getTripAccess(
  tripId: number,
  userId: string | null,
  inviteToken?: string
): Promise<{ trip: any; isMember: boolean; role: string | null } | null> {
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId));
  if (!trip) return null;

  const hasValidToken = !!inviteToken && inviteToken === trip.inviteToken;

  let isMember = false;
  let role: string | null = null;

  if (userId) {
    const [membership] = await db
      .select()
      .from(tripMembersTable)
      .where(and(eq(tripMembersTable.tripId, tripId), eq(tripMembersTable.userId, userId)));
    isMember = !!membership;
    role = membership?.role ?? null;
  }

  if (!hasValidToken && !isMember) return null;

  return { trip, isMember, role };
}

// ── GET /trips/:id/decisions ─────────────────────────────────────────────────
router.get("/", async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const userId = getOptionalAuth(req);
    const inviteToken = req.query.invite as string | undefined;

    const access = await getTripAccess(tripId, userId, inviteToken);
    if (!access) return res.status(403).json({ error: "Access denied" });

    const decisions = await db
      .select()
      .from(groupDecisionsTable)
      .where(eq(groupDecisionsTable.tripId, tripId))
      .orderBy(groupDecisionsTable.createdAt);

    return res.json(decisions);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list decisions" });
  }
});

// ── POST /trips/:id/decisions ────────────────────────────────────────────────
router.post("/", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);

    const access = await getTripAccess(tripId, req.userId);
    if (!access) return res.status(403).json({ error: "Access denied" });
    if (access.role !== "coordinator") return res.status(403).json({ error: "Only the coordinator can create decisions" });

    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: "question is required" });

    const [decision] = await db
      .insert(groupDecisionsTable)
      .values({
        tripId,
        question: question.trim(),
        status: "undecided",
        createdBy: req.userId,
      })
      .returning();

    return res.status(201).json(decision);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create decision" });
  }
});

// ── GET /trips/:id/decisions/:decId ─────────────────────────────────────────
router.get("/:decId", async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);
    const userId = getOptionalAuth(req);
    const inviteToken = req.query.invite as string | undefined;

    const access = await getTripAccess(tripId, userId, inviteToken);
    if (!access) return res.status(403).json({ error: "Access denied" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });

    const comments = await db
      .select()
      .from(decisionCommentsTable)
      .where(eq(decisionCommentsTable.decisionId, decId))
      .orderBy(decisionCommentsTable.createdAt);

    const members = await db
      .select()
      .from(tripMembersTable)
      .where(eq(tripMembersTable.tripId, tripId));

    return res.json({ ...decision, comments, members });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get decision" });
  }
});

// ── POST /trips/:id/decisions/:decId/comments ────────────────────────────────
router.post("/:decId/comments", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);

    const access = await getTripAccess(tripId, req.userId);
    if (!access || !access.isMember) return res.status(403).json({ error: "Only trip members can comment" });

    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "content is required" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });

    const { displayName, avatarUrl } = req.body;
    const [comment] = await db
      .insert(decisionCommentsTable)
      .values({
        decisionId: decId,
        userId: req.userId,
        displayName: displayName ?? null,
        avatarUrl: avatarUrl ?? null,
        content: content.trim(),
      })
      .returning();

    return res.status(201).json(comment);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to post comment" });
  }
});

// ── POST /trips/:id/decisions/:decId/run-verdict ─────────────────────────────
const TRAVEL_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "is", "it", "i", "my", "me", "we", "do", "be", "am", "are", "was",
  "have", "has", "this", "that", "so", "not", "no", "yes", "go", "get", "want",
  "need", "like", "just", "really", "very", "some", "any", "all", "more", "one",
  "two", "three", "week", "weeks", "day", "days", "month", "months", "year",
  "good", "great", "best", "bad", "nice", "can", "could", "would", "should",
  "its", "our", "their", "there", "here", "where", "what", "how", "why", "when",
  "than", "from", "been", "will", "well", "also", "even", "about", "up", "out",
  "if", "as", "had", "he", "she", "they", "you", "your",
]);

const TRAVEL_TERM_EXPANSIONS: Record<string, string[]> = {
  safari: ["safari", "wildlife", "nature", "adventure", "africa"],
  beach: ["beach", "coastal", "island", "ocean", "sea", "surf"],
  mountain: ["mountain", "hiking", "trekking", "alpine", "altitude"],
  food: ["foodie", "restaurant", "café", "cafe", "cuisine", "gastronomy"],
  culture: ["cultural", "history", "museum", "architecture", "art"],
  city: ["city", "urban", "metropolitan", "downtown"],
  nature: ["nature", "park", "reserve", "wilderness", "forest", "jungle"],
  luxury: ["luxury", "resort", "hotel", "spa", "wellness"],
  budget: ["budget", "hostel", "backpacker", "cheap"],
  adventure: ["adventure", "hiking", "trekking", "outdoor", "extreme"],
  romantic: ["romantic", "couples", "honeymoon", "intimate"],
  island: ["island", "coastal", "tropical", "beach"],
  desert: ["desert", "arid", "dunes"],
  jungle: ["jungle", "rainforest", "tropical", "nature"],
  nightlife: ["nightlife", "bar", "club", "party"],
  wellness: ["wellness", "spa", "retreat", "yoga", "meditation"],
  history: ["history", "historical", "ancient", "cultural", "heritage"],
};

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[\s,.\-!?;:()"']+/).filter(w => w.length > 2 && !TRAVEL_STOP_WORDS.has(w));
  const expanded = new Set<string>(words);
  for (const word of words) {
    const expansions = TRAVEL_TERM_EXPANSIONS[word];
    if (expansions) for (const e of expansions) expanded.add(e);
    for (const [, vals] of Object.entries(TRAVEL_TERM_EXPANSIONS)) {
      if (vals.some(v => word.includes(v) || v.includes(word))) {
        for (const v of vals) expanded.add(v);
      }
    }
  }
  return Array.from(expanded);
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function scoreSave(save: any, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  let score = 0;
  const tags = parseTags(save.tags).map((t: string) => t.toLowerCase());
  const category = (save.category ?? "").toLowerCase();
  const placeName = (save.placeName ?? "").toLowerCase();
  const title = (save.scrapedTitle ?? "").toLowerCase();
  const note = (save.note ?? "").toLowerCase();
  const description = (save.description ?? "").toLowerCase();
  for (const kw of keywords) {
    if (tags.some((t: string) => t.includes(kw) || kw.includes(t))) score += 3;
    if (category.includes(kw)) score += 2;
    if (placeName.includes(kw)) score += 2;
    if (title.includes(kw)) score += 1;
    if (note.includes(kw)) score += 1;
    if (description.includes(kw)) score += 1;
  }
  return score;
}

function matchSavesToQuestion(saves: any[], question: string, limit = 15): any[] {
  if (saves.length === 0) return [];
  const keywords = extractKeywords(question);
  const scored = saves.map(s => ({ save: s, score: scoreSave(s, keywords) }));
  scored.sort((a, b) => b.score - a.score);
  const positive = scored.filter(x => x.score > 0);
  const selected = positive.length >= 3 ? positive.slice(0, limit) : scored.slice(0, Math.min(limit, saves.length));
  return selected.map(x => x.save);
}

const GROUP_VERDICT_SYSTEM_PROMPT = `You are a group travel decision engine. A group of travelers is trying to make a joint travel decision. Your job is to synthesize their combined saves, travel profiles, and discussion comments into a single actionable verdict.

You MUST return ONLY valid JSON — no prose, no markdown, no backticks, no wrapper text. Just the raw JSON object.

The JSON must have exactly these fields:
{
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
  "usedSaveIds": [1, 2, 3],
  "whoGetsWhat": [
    {"userId": "...", "memberName": "...", "assignment": "..."}
  ],
  "theSeam": "..."
}

RULES:
- "type": classify as "choose" (picking between options) or "structure" (sequencing/planning a trip).
- "verdict": The group's answer — one decisive headline. Not wishy-washy, not "it depends".
- "travelPatterns": 3 patterns observed across the group's combined saves — the shared DNA.
- "coreConflict": The main tension within the group (different styles, budget gaps, competing priorities).
- "whatYoureMissing": What the group collectively hasn't considered but should.
- "whyThisFits": Why the verdict works for this specific group given their combined save patterns.
- "tradeoffs": What the group gives up with this verdict.
- "avoidIf": Conditions under which this verdict fails for this group.
- "nextMove": The single most important action to lock in the verdict.
- "anchors": 3 specific places, zones, or bases that anchor the trip.
- "timingConfidence": When to go and how confident you are about the timing.
- "stopDoingThis": The one thing the group keeps doing in their planning that is hurting them.
- "usedSaveIds": IDs of saves from any member that you actually used to form the verdict.
- "whoGetsWhat": Per-member breakdown — assign each member a specific task or role for making this trip happen. Must include every member provided. E.g. booking flights, handling accommodation, organizing a day trip, etc.
- "theSeam": The genuine overlap moment — the one thing that perfectly fits every member's travel style simultaneously. Make it specific and human, not generic.
- travelPatterns must have exactly 3 items. anchors must have exactly 3 items.
- Do not use emojis.
- Return ONLY the JSON object, nothing else.`;

router.post("/:decId/run-verdict", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);

    const access = await getTripAccess(tripId, req.userId);
    if (!access) return res.status(403).json({ error: "Access denied" });
    if (access.role !== "coordinator") return res.status(403).json({ error: "Only the coordinator can run a verdict" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });

    const members = await db
      .select()
      .from(tripMembersTable)
      .where(eq(tripMembersTable.tripId, tripId));

    const comments = await db
      .select()
      .from(decisionCommentsTable)
      .where(eq(decisionCommentsTable.decisionId, decId))
      .orderBy(decisionCommentsTable.createdAt);

    const memberUserIds = members.map(m => m.userId);

    const allMemberSaves = memberUserIds.length > 0
      ? await db.select().from(savesTable).where(inArray(savesTable.userId, memberUserIds))
      : [];

    const allProfiles = memberUserIds.length > 0
      ? await db.select().from(userProfilesTable).where(inArray(userProfilesTable.userId, memberUserIds))
      : [];

    const profileMap = new Map(allProfiles.map(p => [p.userId, p.travelProfile]));
    const savesByMember = new Map<string, any[]>();
    for (const save of allMemberSaves) {
      if (!savesByMember.has(save.userId)) savesByMember.set(save.userId, []);
      savesByMember.get(save.userId)!.push(save);
    }

    const memberSections = members.map(member => {
      const name = member.displayName ?? `Member (${member.userId.slice(0, 6)})`;
      const profile = profileMap.get(member.userId);
      const saves = savesByMember.get(member.userId) ?? [];
      const matched = matchSavesToQuestion(saves, decision.question, 15);

      const savesText = matched.length === 0
        ? "No saves available."
        : matched.map(s => {
            const parts = [`ID:${s.id}`];
            if (s.note) parts.push(s.note);
            if (s.scrapedTitle) parts.push(`Title: ${s.scrapedTitle}`);
            if (s.description) parts.push(`Description: ${s.description}`);
            if (s.placeName) parts.push(`Place: ${s.placeName}`);
            const tags = parseTags(s.tags);
            if (tags.length > 0) parts.push(`Tags: ${tags.join(", ")}`);
            if (s.category) parts.push(`Category: ${s.category}`);
            return parts.join("\n");
          }).join("\n\n---\n\n");

      return `=== Member: ${name} (userId: ${member.userId}) ===
Travel profile: ${profile ?? "Not set."}
Relevant saves (${matched.length}/${saves.length} total):
${savesText}`;
    }).join("\n\n");

    const commentThread = comments.length === 0
      ? "No comments yet."
      : comments.map(c => {
          const name = c.displayName ?? c.userId.slice(0, 8);
          return `[${name}]: ${c.content}`;
        }).join("\n");

    const userPrompt = `Group question: ${decision.question}

GROUP MEMBERS:
${memberSections}

DISCUSSION THREAD:
${commentThread}`;

    const callModel = async () => openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: GROUP_VERDICT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const tryParse = (raw: string) => {
      const parsed = JSON.parse(raw);
      return groupVerdictJsonSchema.safeParse(parsed);
    };

    let rawContent = (await callModel()).choices[0]?.message?.content ?? "";
    let validated = tryParse(rawContent);

    if (!validated.success) {
      req.log.warn({ issues: validated.error.issues }, "GroupVerdictJson validation failed on first attempt, retrying");
      rawContent = (await callModel()).choices[0]?.message?.content ?? "";
      validated = tryParse(rawContent);
    }

    if (!validated.success) {
      req.log.error({ issues: validated.error.issues }, "GroupVerdictJson validation failed after retry");
      return res.status(502).json({ error: "AI returned malformed verdict. Please try again." });
    }

    const [updated] = await db
      .update(groupDecisionsTable)
      .set({ verdictJson: validated.data })
      .where(eq(groupDecisionsTable.id, decId))
      .returning();

    return res.json({ ...updated, comments, members });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to run verdict" });
  }
});

// ── PATCH /trips/:id/decisions/:decId/assign ─────────────────────────────────
router.patch("/:decId/assign", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);

    const access = await getTripAccess(tripId, req.userId);
    if (!access) return res.status(403).json({ error: "Access denied" });
    if (access.role !== "coordinator") return res.status(403).json({ error: "Only the coordinator can assign decisions" });

    const { assignedTo } = req.body;
    if (!assignedTo) return res.status(400).json({ error: "assignedTo is required" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });
    if (!decision.verdictJson) return res.status(400).json({ error: "Run a verdict before assigning" });
    if (decision.status === "done") return res.status(400).json({ error: "Cannot modify a completed decision" });
    if (decision.status !== "undecided") return res.status(400).json({ error: "Decision must be undecided to assign" });

    // Validate assignedTo is an actual trip member
    const [targetMember] = await db
      .select()
      .from(tripMembersTable)
      .where(and(eq(tripMembersTable.tripId, tripId), eq(tripMembersTable.userId, assignedTo)));
    if (!targetMember) return res.status(400).json({ error: "assignedTo must be a member of this trip" });

    const [updated] = await db
      .update(groupDecisionsTable)
      .set({ assignedTo, status: "assigned" })
      .where(eq(groupDecisionsTable.id, decId))
      .returning();

    const comments = await db
      .select()
      .from(decisionCommentsTable)
      .where(eq(decisionCommentsTable.decisionId, decId))
      .orderBy(decisionCommentsTable.createdAt);

    const members = await db
      .select()
      .from(tripMembersTable)
      .where(eq(tripMembersTable.tripId, tripId));

    return res.json({ ...updated, comments, members });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to assign decision" });
  }
});

// ── PATCH /trips/:id/decisions/:decId/confirm ─────────────────────────────────
router.patch("/:decId/confirm", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);

    const access = await getTripAccess(tripId, req.userId);
    if (!access || !access.isMember) return res.status(403).json({ error: "Access denied" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });
    if (decision.status === "done") return res.status(400).json({ error: "Decision is already done" });
    if (decision.status !== "assigned") return res.status(400).json({ error: "Decision must be assigned before confirming" });
    if (!decision.assignedTo) return res.status(400).json({ error: "Decision has no assignee" });

    if (decision.assignedTo !== req.userId && access.role !== "coordinator") {
      return res.status(403).json({ error: "Only the assignee or coordinator can confirm" });
    }

    const [updated] = await db
      .update(groupDecisionsTable)
      .set({ status: "done" })
      .where(eq(groupDecisionsTable.id, decId))
      .returning();

    const comments = await db
      .select()
      .from(decisionCommentsTable)
      .where(eq(decisionCommentsTable.decisionId, decId))
      .orderBy(decisionCommentsTable.createdAt);

    const members = await db
      .select()
      .from(tripMembersTable)
      .where(eq(tripMembersTable.tripId, tripId));

    return res.json({ ...updated, comments, members });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to confirm decision" });
  }
});

export default router;
