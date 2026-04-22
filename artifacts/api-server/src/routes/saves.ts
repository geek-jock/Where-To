import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, savesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

router.get("/", requireAuth, async (req: any, res) => {
  try {
    const saves = await db
      .select()
      .from(savesTable)
      .where(eq(savesTable.userId, req.userId))
      .orderBy(savesTable.createdAt);
    res.json(saves);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to list saves" });
  }
});

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { content, url, scrapedTitle, scrapedDescription, scrapedImage } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const [save] = await db.insert(savesTable).values({
      userId: req.userId,
      content,
      url: url ?? null,
      scrapedTitle: scrapedTitle ?? null,
      scrapedDescription: scrapedDescription ?? null,
      scrapedImage: scrapedImage ?? null,
    }).returning();
    res.status(201).json(save);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create save" });
  }
});

router.delete("/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(savesTable).where(and(eq(savesTable.id, id), eq(savesTable.userId, req.userId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete save" });
  }
});

export default router;
