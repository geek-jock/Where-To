import { Router } from "express";
import {
  db,
  savesTable,
  decisionsTable,
  tripsTable,
  tripMembersTable,
  groupDecisionsTable,
  decisionCommentsTable,
  tripOverviewNotesTable,
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
  {
    id: "demo_marco",
    name: "Marco Silva",
    initials: "MS",
    bio: "Works remotely, surfs mornings, moves every 6 weeks. Has strong opinions about coworking wifi and will discuss surf season windows at length.",
    travelStyle: "Digital nomad — surf, remote work, coast",
  },
  {
    id: "demo_priya",
    name: "Priya Sharma",
    initials: "PS",
    bio: "Plans trips around restaurant reservations made months in advance. Equally at home in a €80 kaiseki lunch and a €3 market stall, as long as it's the real thing.",
    travelStyle: "Culinary traveler — fine dining, markets, Michelin",
  },
];

const DEMO_USER_IDS = DEMO_PROFILES.map(p => p.id);

const DEMO_TRIP_TOKENS = [
  "demo-trip-public",
  "demo-lisbon-work",
  "demo-japan-food",
];

function parseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

function enrichMembers(members: typeof tripMembersTable.$inferSelect[]) {
  return members.map(m => {
    const profile = DEMO_PROFILES.find(p => p.id === m.userId);
    return {
      ...m,
      name: m.displayName ?? profile?.name ?? m.userId,
      initials: profile?.initials ?? m.userId.slice(0, 2).toUpperCase(),
    };
  });
}

// GET /demo — profile list + all trip previews
router.get("/", async (req, res) => {
  try {
    const [allSaves, allDecisions, demoTrips] = await Promise.all([
      db.select().from(savesTable).where(inArray(savesTable.userId, DEMO_USER_IDS)),
      db.select().from(decisionsTable).where(inArray(decisionsTable.userId, DEMO_USER_IDS)),
      db.select().from(tripsTable).where(inArray(tripsTable.inviteToken, DEMO_TRIP_TOKENS)),
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

    // Load trip previews (no decisions/comments needed)
    const tripPreviews = await Promise.all(
      demoTrips.map(async trip => {
        const members = await db
          .select()
          .from(tripMembersTable)
          .where(eq(tripMembersTable.tripId, trip.id));
        const decisions = await db
          .select()
          .from(groupDecisionsTable)
          .where(eq(groupDecisionsTable.tripId, trip.id));
        return {
          id: trip.id,
          name: trip.name,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          members: enrichMembers(members).map(m => ({ name: m.name, initials: m.initials, role: m.role })),
          decisions: decisions.map(d => ({
            status: d.status,
            verdictJson: d.verdictJson as { verdict: string } | null,
          })),
        };
      })
    );

    // Sort trips by token order (stable ordering)
    const sortedPreviews = DEMO_TRIP_TOKENS
      .map(token => {
        const idx = demoTrips.findIndex(t => t.inviteToken === token);
        return idx >= 0 ? tripPreviews[idx] : null;
      })
      .filter(Boolean);

    res.json({ profiles: profilesWithData, demoTrips: sortedPreviews, seeded: hasData });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load demo profiles" });
  }
});

// GET /demo/trips/:id — full trip detail with overview notes, decisions, comments
router.get("/trips/:id", async (req, res) => {
  try {
    const tripId = parseInt(req.params.id ?? "", 10);
    if (isNaN(tripId)) {
      res.status(400).json({ error: "Invalid trip id" });
      return;
    }

    const [trips, members, groupDecisions, overviewRows] = await Promise.all([
      db.select().from(tripsTable).where(eq(tripsTable.id, tripId)),
      db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, tripId)),
      db.select().from(groupDecisionsTable).where(eq(groupDecisionsTable.tripId, tripId)),
      db.select().from(tripOverviewNotesTable).where(eq(tripOverviewNotesTable.tripId, tripId)),
    ]);

    const trip = trips[0];
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    // Only serve demo trips via this route
    if (!DEMO_TRIP_TOKENS.includes(trip.inviteToken)) {
      res.status(403).json({ error: "Not a demo trip" });
      return;
    }

    const decisionsWithComments = await Promise.all(
      groupDecisions.map(async dec => {
        const comments = await db
          .select()
          .from(decisionCommentsTable)
          .where(eq(decisionCommentsTable.decisionId, dec.id));
        return { ...dec, comments };
      })
    );

    res.json({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      overviewNotes: overviewRows[0]?.content ?? null,
      members: enrichMembers(members),
      decisions: decisionsWithComments,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load demo trip" });
  }
});

export default router;
