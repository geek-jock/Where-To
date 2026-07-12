import { Router } from "express";
import { db, savesTable, decisionsTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";

const router = Router();

const DEMO_PROFILES = [
  {
    id: "demo_elena",
    name: "Elena Vasquez",
    initials: "EV",
    bio: "Moves slowly through Southern Europe and Mexico. Stays four weeks somewhere before the next place earns her attention.",
    travelStyle: "Slow wanderer — food, markets, fermented things",
  },
  {
    id: "demo_james",
    name: "James Okoro",
    initials: "JO",
    bio: "Chases the edge — volcanoes, glaciers, polar night. If there's a road, it's probably not remote enough.",
    travelStyle: "Remote chaser — extreme terrain, minimal infrastructure",
  },
  {
    id: "demo_nina",
    name: "Nina Chen",
    initials: "NC",
    bio: "Short, intense city breaks. Leaves knowing the neighborhood better than the highlights. Galleries and a serious meal every night.",
    travelStyle: "City hopper — art, design, restaurants",
  },
];

const DEMO_USER_IDS = DEMO_PROFILES.map(p => p.id);

function parseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

router.get("/", async (req, res) => {
  try {
    const [allSaves, allDecisions] = await Promise.all([
      db.select().from(savesTable).where(inArray(savesTable.userId, DEMO_USER_IDS)),
      db.select().from(decisionsTable).where(inArray(decisionsTable.userId, DEMO_USER_IDS)),
    ]);

    const profilesWithData = DEMO_PROFILES.map(profile => {
      const saves = allSaves
        .filter(s => s.userId === profile.id)
        .map(s => ({ ...s, tags: parseTags(s.tags) }));
      const decisions = allDecisions
        .filter(d => d.userId === profile.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return { ...profile, saves, decisions };
    });

    const hasData = profilesWithData.some(p => p.saves.length > 0);

    res.json({ profiles: profilesWithData, seeded: hasData });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load demo profiles" });
  }
});

export default router;
