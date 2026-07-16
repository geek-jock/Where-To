import { Router } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, savesTable, saveShareRequestsTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  req.userId = userId;
  next();
}

function parseTags(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

function withTags(save: any) {
  return { ...save, tags: parseTags(save.tags) };
}

async function resolveUserIdByEmail(email: string): Promise<string | null> {
  try {
    const users = await clerkClient.users.getUserList({ emailAddress: [email] });
    return users.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}

router.post("/request", requireAuth, async (req: any, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const senderEmail = await getUserEmail(req.userId);
    if (senderEmail && senderEmail.toLowerCase() === normalizedEmail) {
      return res.status(400).json({ error: "You cannot send a share request to yourself" });
    }

    const toUserId = await resolveUserIdByEmail(normalizedEmail);

    const existing = await db
      .select()
      .from(saveShareRequestsTable)
      .where(
        and(
          eq(saveShareRequestsTable.fromUserId, req.userId),
          eq(saveShareRequestsTable.toEmail, normalizedEmail),
          or(
            eq(saveShareRequestsTable.status, "pending"),
            eq(saveShareRequestsTable.status, "accepted")
          )
        )
      );

    if (existing.length > 0) {
      return res.status(409).json({ error: "A pending or active share request already exists" });
    }

    const [request] = await db
      .insert(saveShareRequestsTable)
      .values({
        fromUserId: req.userId,
        toEmail: normalizedEmail,
        toUserId: toUserId ?? undefined,
        status: "pending",
      })
      .returning();

    return res.status(201).json(request);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to send share request" });
  }
});

router.get("/requests", requireAuth, async (req: any, res) => {
  try {
    const myEmail = await getUserEmail(req.userId);
    if (!myEmail) return res.json([]);

    const normalizedEmail = myEmail.toLowerCase();

    const rows = await db
      .select()
      .from(saveShareRequestsTable)
      .where(
        and(
          or(
            eq(saveShareRequestsTable.toEmail, normalizedEmail),
            eq(saveShareRequestsTable.toUserId, req.userId)
          ),
          eq(saveShareRequestsTable.status, "pending")
        )
      );

    const enriched = await Promise.all(
      rows.map(async (r) => {
        let senderEmail: string | null = null;
        try {
          const user = await clerkClient.users.getUser(r.fromUserId);
          senderEmail = user.emailAddresses[0]?.emailAddress ?? null;
        } catch { /* non-fatal */ }
        return { ...r, senderEmail };
      })
    );

    return res.json(enriched);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list requests" });
  }
});

router.patch("/requests/:id", requireAuth, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { action } = req.body;
    if (action !== "accept" && action !== "decline") {
      return res.status(400).json({ error: "action must be accept or decline" });
    }

    const myEmail = await getUserEmail(req.userId);
    if (!myEmail) return res.status(400).json({ error: "Could not resolve your email" });

    const normalizedEmail = myEmail.toLowerCase();

    const [row] = await db
      .select()
      .from(saveShareRequestsTable)
      .where(eq(saveShareRequestsTable.id, id));

    if (!row) return res.status(404).json({ error: "Request not found" });

    if (
      row.toEmail !== normalizedEmail &&
      row.toUserId !== req.userId
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (row.status !== "pending") {
      return res.status(409).json({ error: "Request is no longer pending" });
    }

    const newStatus = action === "accept" ? "accepted" : "declined";

    const [updated] = await db
      .update(saveShareRequestsTable)
      .set({ status: newStatus, toUserId: req.userId })
      .where(eq(saveShareRequestsTable.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update request" });
  }
});

router.delete("/:userId", requireAuth, async (req: any, res) => {
  try {
    const otherUserId = req.params.userId;

    const otherEmail = await getUserEmail(otherUserId);
    const myEmail = await getUserEmail(req.userId);

    await db
      .update(saveShareRequestsTable)
      .set({ status: "revoked" })
      .where(
        and(
          eq(saveShareRequestsTable.fromUserId, req.userId),
          eq(saveShareRequestsTable.toUserId, otherUserId),
          eq(saveShareRequestsTable.status, "accepted")
        )
      );

    if (otherEmail && myEmail) {
      await db
        .update(saveShareRequestsTable)
        .set({ status: "revoked" })
        .where(
          and(
            eq(saveShareRequestsTable.fromUserId, otherUserId),
            eq(saveShareRequestsTable.toEmail, myEmail.toLowerCase()),
            eq(saveShareRequestsTable.status, "accepted")
          )
        );
    }

    return res.json({ success: true });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to revoke sharing" });
  }
});

router.get("/", requireAuth, async (req: any, res) => {
  try {
    const myEmail = await getUserEmail(req.userId);
    if (!myEmail) return res.json([]);
    const normalizedEmail = myEmail.toLowerCase();

    const asSender = await db
      .select()
      .from(saveShareRequestsTable)
      .where(
        and(
          eq(saveShareRequestsTable.fromUserId, req.userId),
          eq(saveShareRequestsTable.status, "accepted")
        )
      );

    const asRecipient = await db
      .select()
      .from(saveShareRequestsTable)
      .where(
        and(
          or(
            eq(saveShareRequestsTable.toEmail, normalizedEmail),
            eq(saveShareRequestsTable.toUserId, req.userId)
          ),
          eq(saveShareRequestsTable.status, "accepted")
        )
      );

    const friendUserIds = new Set<string>();
    for (const r of asSender) {
      if (r.toUserId) friendUserIds.add(r.toUserId);
    }
    for (const r of asRecipient) {
      friendUserIds.add(r.fromUserId);
    }

    const friends = await Promise.all(
      Array.from(friendUserIds).map(async (uid) => {
        try {
          const user = await clerkClient.users.getUser(uid);
          return {
            userId: uid,
            email: user.emailAddresses[0]?.emailAddress ?? null,
            displayName: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null,
            avatarUrl: user.imageUrl ?? null,
          };
        } catch {
          return { userId: uid, email: null, displayName: null, avatarUrl: null };
        }
      })
    );

    return res.json(friends);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to list friends" });
  }
});

router.get("/:userId/saves", requireAuth, async (req: any, res) => {
  try {
    const otherUserId = req.params.userId;

    const myEmail = await getUserEmail(req.userId);
    if (!myEmail) return res.status(403).json({ error: "Forbidden" });
    const normalizedEmail = myEmail.toLowerCase();

    const asSender = await db
      .select()
      .from(saveShareRequestsTable)
      .where(
        and(
          eq(saveShareRequestsTable.fromUserId, req.userId),
          eq(saveShareRequestsTable.toUserId, otherUserId),
          eq(saveShareRequestsTable.status, "accepted")
        )
      );

    const asRecipient = await db
      .select()
      .from(saveShareRequestsTable)
      .where(
        and(
          eq(saveShareRequestsTable.fromUserId, otherUserId),
          or(
            eq(saveShareRequestsTable.toEmail, normalizedEmail),
            eq(saveShareRequestsTable.toUserId, req.userId)
          ),
          eq(saveShareRequestsTable.status, "accepted")
        )
      );

    if (asSender.length === 0 && asRecipient.length === 0) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const saves = await db
      .select()
      .from(savesTable)
      .where(eq(savesTable.userId, otherUserId))
      .orderBy(savesTable.createdAt);

    return res.json(saves.map(withTags));
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to fetch friend saves" });
  }
});

export default router;
