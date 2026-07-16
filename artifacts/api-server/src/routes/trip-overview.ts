import { Router } from "express";
import { getAuth } from "@clerk/express";
import {
  db,
  groupDecisionsTable,
  tripMembersTable,
  tripsTable,
  tripOverviewNotesTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

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

// ── GET /trips/:id/overview ───────────────────────────────────────────────────
router.get("/overview", async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const userId = getOptionalAuth(req);
    const inviteToken = req.query.invite as string | undefined;

    const access = await getTripAccess(tripId, userId, inviteToken);
    if (!access) return res.status(403).json({ error: "Access denied" });

    const [decisions, members, notesRow] = await Promise.all([
      db
        .select()
        .from(groupDecisionsTable)
        .where(
          and(
            eq(groupDecisionsTable.tripId, tripId),
            inArray(groupDecisionsTable.status, ["done", "assigned"])
          )
        )
        .orderBy(groupDecisionsTable.createdAt),
      db.select().from(tripMembersTable).where(eq(tripMembersTable.tripId, tripId)),
      db
        .select()
        .from(tripOverviewNotesTable)
        .where(eq(tripOverviewNotesTable.tripId, tripId))
        .then((rows) => rows[0] ?? null),
    ]);

    const memberMap = new Map(members.map((m) => [m.userId, m]));

    const booked = decisions
      .filter((d) => d.status === "done")
      .map((d) => ({
        ...d,
        bookedByMember: d.assignedTo ? (memberMap.get(d.assignedTo) ?? null) : null,
        assignedMember: null,
      }));

    const needToBook = decisions
      .filter((d) => d.status === "assigned")
      .map((d) => ({
        ...d,
        bookedByMember: null,
        assignedMember: d.assignedTo ? (memberMap.get(d.assignedTo) ?? null) : null,
      }));

    return res.json({
      booked,
      needToBook,
      members,
      notes: notesRow
        ? { content: notesRow.content, updatedAt: notesRow.updatedAt }
        : { content: "", updatedAt: null },
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to load trip overview" });
  }
});

// ── PATCH /trips/:id/overview/notes ──────────────────────────────────────────
router.patch("/overview/notes", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);

    const access = await getTripAccess(tripId, req.userId);
    if (!access) return res.status(403).json({ error: "Access denied" });
    if (access.role !== "coordinator") return res.status(403).json({ error: "Only the coordinator can edit notes" });

    const { content } = req.body;
    if (typeof content !== "string") return res.status(400).json({ error: "content is required" });

    const [notes] = await db
      .insert(tripOverviewNotesTable)
      .values({ tripId, content })
      .onConflictDoUpdate({
        target: tripOverviewNotesTable.tripId,
        set: { content, updatedAt: new Date() },
      })
      .returning();

    return res.json({ content: notes.content, updatedAt: notes.updatedAt });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update notes" });
  }
});

// ── PATCH /trips/:id/decisions/:decId/meta ───────────────────────────────────
router.patch("/decisions/:decId/meta", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);

    const access = await getTripAccess(tripId, req.userId);
    if (!access) return res.status(403).json({ error: "Access denied" });
    if (access.role !== "coordinator") return res.status(403).json({ error: "Only the coordinator can update decision metadata" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });

    const updateFields: Record<string, unknown> = {};
    if ("costPerPax" in req.body) updateFields.costPerPax = req.body.costPerPax ?? null;
    if ("confirmationLink" in req.body) updateFields.confirmationLink = req.body.confirmationLink ?? null;

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const [updated] = await db
      .update(groupDecisionsTable)
      .set(updateFields)
      .where(eq(groupDecisionsTable.id, decId))
      .returning();

    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update decision metadata" });
  }
});

// ── POST /trips/:id/decisions/:decId/nudge ───────────────────────────────────
router.post("/decisions/:decId/nudge", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);
    const decId = parseInt(req.params.decId);

    const access = await getTripAccess(tripId, req.userId);
    if (!access) return res.status(403).json({ error: "Access denied" });
    if (access.role !== "coordinator") return res.status(403).json({ error: "Only the coordinator can nudge members" });

    const [decision] = await db
      .select()
      .from(groupDecisionsTable)
      .where(and(eq(groupDecisionsTable.id, decId), eq(groupDecisionsTable.tripId, tripId)));
    if (!decision) return res.status(404).json({ error: "Decision not found" });
    if (decision.status !== "assigned") return res.status(400).json({ error: "Decision must be assigned to nudge" });
    if (!decision.assignedTo) return res.status(400).json({ error: "Decision has no assignee" });

    const [notification] = await db
      .insert(notificationsTable)
      .values({
        userId: decision.assignedTo,
        tripId,
        decisionId: decId,
        message: `Reminder: you've been asked to book "${decision.question}"`,
        read: false,
      })
      .returning();

    return res.status(201).json(notification);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to send nudge" });
  }
});

// ── GET /trips/:id/notifications ─────────────────────────────────────────────
router.get("/notifications", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);

    const access = await getTripAccess(tripId, req.userId);
    if (!access || !access.isMember) return res.status(403).json({ error: "Access denied" });

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, req.userId),
          eq(notificationsTable.tripId, tripId)
        )
      )
      .orderBy(notificationsTable.createdAt);

    return res.json(notifications);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get notifications" });
  }
});

// ── PATCH /trips/:id/notifications/read-all ──────────────────────────────────
router.patch("/notifications/read-all", requireAuth, async (req: any, res) => {
  try {
    const tripId = parseInt(req.params.id);

    const access = await getTripAccess(tripId, req.userId);
    if (!access || !access.isMember) return res.status(403).json({ error: "Access denied" });

    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.userId, req.userId),
          eq(notificationsTable.tripId, tripId)
        )
      );

    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

export default router;
