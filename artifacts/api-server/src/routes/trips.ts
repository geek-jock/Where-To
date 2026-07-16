import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, tripsTable, tripMembersTable, groupDecisionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import crypto from "crypto";
import tripDecisionsRouter from "./trip-decisions";
import tripOverviewRouter from "./trip-overview";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

router.post("/", requireAuth, async (req: any, res) => {
  try {
    const { name, destination, startDate, endDate, displayName, avatarUrl } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Trip name is required" });

    const inviteToken = crypto.randomBytes(16).toString("hex");

    const [trip] = await db.insert(tripsTable).values({
      name: name.trim(),
      destination: destination?.trim() ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      coordinatorId: req.userId,
      inviteToken,
    }).returning();

    await db.insert(tripMembersTable).values({
      tripId: trip.id,
      userId: req.userId,
      role: "coordinator",
      displayName: displayName ?? null,
      avatarUrl: avatarUrl ?? null,
    });

    return res.status(201).json(trip);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create trip" });
  }
});

router.get("/", requireAuth, async (req: any, res) => {
  try {
    const memberships = await db
      .select({ tripId: tripMembersTable.tripId })
      .from(tripMembersTable)
      .where(eq(tripMembersTable.userId, req.userId));

    if (memberships.length === 0) return res.json([]);

    const tripIds = memberships.map((m) => m.tripId);
    const trips = await db
      .select()
      .from(tripsTable)
      .where(inArray(tripsTable.id, tripIds));

    return res.json(trips);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list trips" });
  }
});

router.get("/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const inviteToken = req.query.invite as string | undefined;
    const auth = getAuth(req);
    const userId = auth?.userId;

    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const hasValidToken = !!inviteToken && inviteToken === trip.inviteToken;

    let isMember = false;
    let userRole: string | null = null;
    if (userId) {
      const [membership] = await db
        .select()
        .from(tripMembersTable)
        .where(and(eq(tripMembersTable.tripId, id), eq(tripMembersTable.userId, userId)));
      isMember = !!membership;
      userRole = membership?.role ?? null;
    }

    if (!hasValidToken && !isMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    const members = await db
      .select()
      .from(tripMembersTable)
      .where(eq(tripMembersTable.tripId, id));

    // Compute last activity: most recent member join or trip creation
    const latestJoin = members.reduce<Date | null>((max, m) => {
      const t = new Date(m.joinedAt);
      return max === null || t > max ? t : max;
    }, null);
    const lastActivityAt = latestJoin && latestJoin > new Date(trip.createdAt)
      ? latestJoin.toISOString()
      : new Date(trip.createdAt).toISOString();

    const openDecisions = await db
      .select({ id: groupDecisionsTable.id })
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.tripId, id), eq(groupDecisionsTable.status, "undecided")));
    const openDecisionCount = openDecisions.length;

    return res.json({
      ...trip,
      members,
      currentUserRole: userRole,
      isGuest: !isMember,
      openDecisionCount,
      lastActivityAt,
    });
  } catch (err) {
    const log = (req as any).log;
    if (log) log.error(err);
    return res.status(500).json({ error: "Failed to get trip" });
  }
});

router.post("/:id/join", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { inviteToken, displayName, avatarUrl } = req.body;

    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, id));
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (trip.inviteToken !== inviteToken) return res.status(403).json({ error: "Invalid invite token" });

    const [existing] = await db
      .select()
      .from(tripMembersTable)
      .where(and(eq(tripMembersTable.tripId, id), eq(tripMembersTable.userId, req.userId)));

    if (!existing) {
      await db.insert(tripMembersTable).values({
        tripId: id,
        userId: req.userId,
        role: "member",
        displayName: displayName ?? null,
        avatarUrl: avatarUrl ?? null,
      });
    }

    const members = await db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, id));
    const role = existing?.role ?? "member";
    const latestJoin = members.reduce<Date | null>((max, m) => {
      const t = new Date(m.joinedAt);
      return max === null || t > max ? t : max;
    }, null);
    const lastActivityAt = latestJoin && latestJoin > new Date(trip.createdAt)
      ? latestJoin.toISOString()
      : new Date(trip.createdAt).toISOString();
    return res.json({ ...trip, members, currentUserRole: role, isGuest: false, openDecisionCount: 0, lastActivityAt });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to join trip" });
  }
});

router.use("/:id/decisions", tripDecisionsRouter);
router.use("/:id", tripOverviewRouter);

export default router;
