import { Router } from "express";
import {
  db,
  savesTable,
  decisionsTable,
  tripsTable,
  tripMembersTable,
  groupDecisionsTable,
  decisionCommentsTable,
} from "@workspace/db";
import { inArray, eq } from "drizzle-orm";

const router = Router();

export const DEMO_PROFILES = [
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
const DEMO_TRIP_INVITE_TOKEN = "demo-trip-public";

function parseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

router.get("/", async (req, res) => {
  try {
    const [allSaves, allDecisions, demoTrips] = await Promise.all([
      db.select().from(savesTable).where(inArray(savesTable.userId, DEMO_USER_IDS)),
      db.select().from(decisionsTable).where(inArray(decisionsTable.userId, DEMO_USER_IDS)),
      db.select().from(tripsTable).where(eq(tripsTable.inviteToken, DEMO_TRIP_INVITE_TOKEN)),
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

    // Load demo trip with members, decisions, and comments
    let demoTrip = null;
    const trip = demoTrips[0];
    if (trip) {
      const [members, groupDecisions] = await Promise.all([
        db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, trip.id)),
        db.select().from(groupDecisionsTable).where(eq(groupDecisionsTable.tripId, trip.id)),
      ]);

      const decisionsWithComments = await Promise.all(
        groupDecisions.map(async dec => {
          const comments = await db
            .select()
            .from(decisionCommentsTable)
            .where(eq(decisionCommentsTable.decisionId, dec.id));
          return { ...dec, comments };
        })
      );

      // Enrich members with profile display info
      const enrichedMembers = members.map(m => {
        const profile = DEMO_PROFILES.find(p => p.id === m.userId);
        return {
          ...m,
          name: m.displayName ?? profile?.name ?? m.userId,
          initials: profile?.initials ?? m.userId.slice(0, 2).toUpperCase(),
        };
      });

      demoTrip = {
        ...trip,
        members: enrichedMembers,
        decisions: decisionsWithComments,
      };
    }

    res.json({ profiles: profilesWithData, demoTrip, seeded: hasData });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load demo profiles" });
  }
});

export default router;
