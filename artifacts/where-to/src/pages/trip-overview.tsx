import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTrip,
  useGetTripOverview,
  useUpdateTripOverviewNotes,
  useNudgeDecisionAssignee,
  useUpdateGroupDecisionMeta,
  useGetTripNotifications,
  useMarkTripNotificationsRead,
  getGetTripOverviewQueryKey,
  getGetTripNotificationsQueryKey,
} from "@workspace/api-client-react";
import type { TripMember, TripOverviewDecision } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  UserCheck,
  Link as LinkIcon,
  DollarSign,
  Bell,
  BellRing,
  Pencil,
  Check,
  X,
  Loader2,
  MapPin,
  BookOpen,
  AlertCircle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function getInitials(displayName: string | null | undefined): string {
  if (!displayName) return "?";
  return displayName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function MemberChip({ member }: { member: TripMember }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt={member.displayName ?? ""} className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground flex-shrink-0">
          {getInitials(member.displayName)}
        </span>
      )}
      <span className="text-sm font-medium text-foreground">{member.displayName ?? "Member"}</span>
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60 mb-3">{children}</p>
  );
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="border border-dashed border-border p-8 flex flex-col items-center justify-center text-center">
      <Icon className="h-8 w-8 text-muted-foreground/25 mb-3" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground/60 mt-1">{subtitle}</p>}
    </div>
  );
}

function BookedDecisionCard({
  decision,
  isCoordinator,
  tripId,
  onMetaUpdated,
}: {
  decision: TripOverviewDecision;
  isCoordinator: boolean;
  tripId: number;
  onMetaUpdated: () => void;
}) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [costInput, setCostInput] = useState(decision.costPerPax ?? "");
  const [linkInput, setLinkInput] = useState(decision.confirmationLink ?? "");
  const updateMeta = useUpdateGroupDecisionMeta();
  const { toast } = useToast();

  const handleSaveMeta = async () => {
    try {
      await updateMeta.mutateAsync({
        id: tripId,
        decId: decision.id,
        data: {
          costPerPax: costInput.trim() || null,
          confirmationLink: linkInput.trim() || null,
        },
      });
      setEditingMeta(false);
      onMetaUpdated();
      toast({ title: "Details saved" });
    } catch {
      toast({ title: "Failed to save details", variant: "destructive" });
    }
  };

  const verdictName = decision.verdictJson?.verdict ?? decision.question;

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">{verdictName}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{decision.question}</p>
        </div>
        {isCoordinator && !editingMeta && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground"
            onClick={() => {
              setCostInput(decision.costPerPax ?? "");
              setLinkInput(decision.confirmationLink ?? "");
              setEditingMeta(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>

      {editingMeta ? (
        <div className="space-y-2 pl-7">
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="Cost per person (e.g. $120)"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Confirmation link (booking URL)"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingMeta(false)}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSaveMeta} disabled={updateMeta.isPending}>
              {updateMeta.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="pl-7 space-y-1.5">
          {decision.bookedByMember && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserCheck className="h-3 w-3 flex-shrink-0" />
              <span>Booked by </span>
              <MemberChip member={decision.bookedByMember} />
            </div>
          )}
          {decision.costPerPax && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3 flex-shrink-0" />
              <span>{decision.costPerPax} per person</span>
            </div>
          )}
          {decision.confirmationLink && (
            <div className="flex items-center gap-2 text-xs">
              <LinkIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <a
                href={decision.confirmationLink}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Confirmation
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}
          {!decision.bookedByMember && !decision.costPerPax && !decision.confirmationLink && isCoordinator && (
            <p className="text-xs text-muted-foreground/50 italic">Click edit to add cost and confirmation link</p>
          )}
        </div>
      )}
    </div>
  );
}

function NeedToBookCard({
  decision,
  isCoordinator,
  tripId,
  onNudged,
  onMetaUpdated,
}: {
  decision: TripOverviewDecision;
  isCoordinator: boolean;
  tripId: number;
  onNudged: () => void;
  onMetaUpdated: () => void;
}) {
  const [editingMeta, setEditingMeta] = useState(false);
  const [costInput, setCostInput] = useState(decision.costPerPax ?? "");
  const [linkInput, setLinkInput] = useState(decision.confirmationLink ?? "");
  const nudge = useNudgeDecisionAssignee();
  const updateMeta = useUpdateGroupDecisionMeta();
  const { toast } = useToast();

  const handleNudge = async () => {
    try {
      await nudge.mutateAsync({ id: tripId, decId: decision.id });
      toast({ title: "Nudge sent!" });
      onNudged();
    } catch {
      toast({ title: "Failed to send nudge", variant: "destructive" });
    }
  };

  const handleSaveMeta = async () => {
    try {
      await updateMeta.mutateAsync({
        id: tripId,
        decId: decision.id,
        data: {
          costPerPax: costInput.trim() || null,
          confirmationLink: linkInput.trim() || null,
        },
      });
      setEditingMeta(false);
      onMetaUpdated();
      toast({ title: "Details saved" });
    } catch {
      toast({ title: "Failed to save details", variant: "destructive" });
    }
  };

  return (
    <div className="border border-border bg-card p-4 space-y-3" data-testid={`need-to-book-${decision.id}`}>
      <div className="flex items-start gap-3">
        <Clock className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {decision.verdictJson?.verdict ?? decision.question}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{decision.question}</p>
        </div>
        {isCoordinator && !editingMeta && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-muted-foreground"
            onClick={() => {
              setCostInput(decision.costPerPax ?? "");
              setLinkInput(decision.confirmationLink ?? "");
              setEditingMeta(true);
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>

      {editingMeta ? (
        <div className="space-y-2 pl-7">
          {decision.assignedMember && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserCheck className="h-3 w-3 flex-shrink-0" />
              <span>Assigned to </span>
              <MemberChip member={decision.assignedMember} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              placeholder="Estimated cost per person (e.g. $80)"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Reference / booking link"
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingMeta(false)}>
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSaveMeta} disabled={updateMeta.isPending}>
              {updateMeta.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="pl-7 space-y-1.5">
          {decision.assignedMember && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserCheck className="h-3 w-3 flex-shrink-0" />
              <span>Assigned to </span>
              <MemberChip member={decision.assignedMember} />
            </div>
          )}
          {decision.costPerPax && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3 flex-shrink-0" />
              <span>~{decision.costPerPax} per person</span>
            </div>
          )}
          {decision.confirmationLink && (
            <div className="flex items-center gap-2 text-xs">
              <LinkIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              <a
                href={decision.confirmationLink}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Reference link
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}
          {!decision.assignedMember && !decision.costPerPax && !decision.confirmationLink && isCoordinator && (
            <p className="text-xs text-muted-foreground/50 italic">Click edit to add estimated cost and a reference link</p>
          )}
        </div>
      )}

      {!editingMeta && isCoordinator && decision.assignedMember && (
        <div className="pl-7 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleNudge}
            disabled={nudge.isPending}
          >
            {nudge.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellRing className="h-3 w-3" />}
            Nudge {decision.assignedMember.displayName ?? "them"}
          </Button>
        </div>
      )}
    </div>
  );
}

function groupByDay(decisions: TripOverviewDecision[]): { dayLabel: string; items: TripOverviewDecision[] }[] {
  const groups: Map<string, TripOverviewDecision[]> = new Map();
  for (const d of decisions) {
    const day = d.createdAt.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(d);
  }
  const sorted = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([, items], i) => ({
    dayLabel: `Day ${i + 1}`,
    items,
  }));
}

function NotificationsPanel({
  tripId,
  onClose,
}: {
  tripId: number;
  onClose: () => void;
}) {
  const { data: notifications = [], isLoading } = useGetTripNotifications(tripId);
  const markRead = useMarkTripNotificationsRead();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMarkAllRead = async () => {
    try {
      await markRead.mutateAsync({ id: tripId });
      queryClient.invalidateQueries({ queryKey: getGetTripNotificationsQueryKey(tripId) });
    } catch {
      toast({ title: "Failed to mark as read", variant: "destructive" });
    }
  };

  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="border border-border bg-card shadow-md">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold">Notifications</p>
        <div className="flex items-center gap-2">
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleMarkAllRead} disabled={markRead.isPending}>
              Mark all read
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`px-4 py-3 ${n.read ? "opacity-60" : ""}`}>
              <p className="text-sm text-foreground leading-snug">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                {!n.read && <span className="ml-2 inline-block w-1.5 h-1.5 bg-primary rounded-full" />}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function TripOverview() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const searchStr = window.location.search;
  const params = new URLSearchParams(searchStr);
  const inviteToken = params.get("invite") ?? undefined;

  const tripParams = inviteToken ? { invite: inviteToken } : undefined;
  const { data: trip, isLoading: tripLoading } = useGetTrip(tripId, tripParams);
  const { data: overview, isLoading: overviewLoading } = useGetTripOverview(tripId, tripParams);
  const { data: notifications = [] } = useGetTripNotifications(tripId);

  const updateNotes = useUpdateTripOverviewNotes();
  const [notesValue, setNotesValue] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const isLoading = tripLoading || overviewLoading;

  const isCoordinator = trip?.currentUserRole === "coordinator";
  const isGuest = trip?.isGuest ?? false;

  const notesContent = notesValue !== null ? notesValue : (overview?.notes?.content ?? "");
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSaveNotes = async () => {
    try {
      await updateNotes.mutateAsync({ id: tripId, data: { content: notesContent } });
      setEditingNotes(false);
      queryClient.invalidateQueries({ queryKey: getGetTripOverviewQueryKey(tripId) });
      toast({ title: "Notes saved" });
    } catch {
      toast({ title: "Failed to save notes", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!trip || !overview) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <Link href="/trips">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to trips
          </Button>
        </Link>
        <div className="py-16 text-center">
          <p className="text-muted-foreground">Trip not found or access denied.</p>
        </div>
      </div>
    );
  }

  const bookedDayGroups = groupByDay(overview.booked);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link href={`/trips/${tripId}${inviteToken ? `?invite=${inviteToken}` : ""}`}>
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground" data-testid="link-back-trip">
            <ArrowLeft className="h-4 w-4" />
            {trip.name}
          </Button>
        </Link>
        {/* Notification bell */}
        {!isGuest && (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 relative"
              onClick={() => setShowNotifications((v) => !v)}
              data-testid="button-notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-primary text-primary-foreground rounded-full text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
            {showNotifications && (
              <div className="absolute right-0 top-10 w-80 z-50">
                <NotificationsPanel tripId={tripId} onClose={() => setShowNotifications(false)} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{trip.destination ?? trip.name}</span>
        </div>
        <h1 className="text-3xl font-serif font-bold text-foreground" data-testid="title-overview">
          Trip Overview
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {overview.booked.length} booked · {overview.needToBook.length} pending
        </p>
      </div>

      <div className="space-y-10">
        {/* ── Booked section ── */}
        <section>
          <SectionLabel>Booked</SectionLabel>
          {overview.booked.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing booked yet"
              subtitle="Decisions confirmed as Done will appear here"
            />
          ) : (
            <div className="space-y-3">
              {overview.booked.map((d) => (
                <BookedDecisionCard
                  key={d.id}
                  decision={d}
                  isCoordinator={isCoordinator}
                  tripId={tripId}
                  onMetaUpdated={() => queryClient.invalidateQueries({ queryKey: getGetTripOverviewQueryKey(tripId) })}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Need to Book section ── */}
        <section>
          <SectionLabel>Need to Book</SectionLabel>
          {overview.needToBook.length === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="Nothing pending"
              subtitle="Assigned decisions appear here until they're confirmed"
            />
          ) : (
            <div className="space-y-3">
              {overview.needToBook.map((d) => (
                <NeedToBookCard
                  onMetaUpdated={() => queryClient.invalidateQueries({ queryKey: getGetTripOverviewQueryKey(tripId) })}
                  key={d.id}
                  decision={d}
                  isCoordinator={isCoordinator}
                  tripId={tripId}
                  onNudged={() => queryClient.invalidateQueries({ queryKey: getGetTripNotificationsQueryKey(tripId) })}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Rough Guide section ── */}
        {overview.booked.length > 0 && (
          <section>
            <SectionLabel>Rough Guide</SectionLabel>
            <div className="space-y-4">
              {bookedDayGroups.map(({ dayLabel, items }) => (
                <div key={dayLabel} className="border-l-2 border-primary/30 pl-4 space-y-2">
                  <p className="text-xs font-semibold tracking-wider uppercase text-primary/70">{dayLabel}</p>
                  {items.map((d) => (
                    <div key={d.id} className="flex items-start gap-2">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {d.verdictJson?.verdict ?? d.question}
                        </p>
                        {d.costPerPax && (
                          <p className="text-xs text-muted-foreground mt-0.5">{d.costPerPax}/pax</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Practical Notes section ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Practical Notes</SectionLabel>
            {isCoordinator && !editingNotes && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground -mt-3"
                onClick={() => {
                  setNotesValue(notesContent);
                  setEditingNotes(true);
                }}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
          </div>

          {editingNotes ? (
            <div className="space-y-3">
              <Textarea
                value={notesContent}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder="Add visa requirements, emergency contacts, local transport tips, house rules..."
                className="min-h-[140px] text-sm resize-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingNotes(false); setNotesValue(null); }}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSaveNotes} disabled={updateNotes.isPending}>
                  {updateNotes.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  Save notes
                </Button>
              </div>
            </div>
          ) : notesContent ? (
            <div className="border border-border p-4 bg-muted/20">
              <div className="flex items-start gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{notesContent}</p>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No notes yet"
              subtitle={isCoordinator ? "Add visa info, contacts, and logistics above" : "The coordinator will add practical notes here"}
            />
          )}
        </section>
      </div>
    </div>
  );
}
