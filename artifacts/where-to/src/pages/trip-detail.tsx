import React, { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTrip,
  useJoinTrip,
  useListGroupDecisions,
  useCreateGroupDecision,
  getGetTripQueryKey,
  getListGroupDecisionsQueryKey,
} from "@workspace/api-client-react";
import type { TripMember, GroupDecision } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Crown,
  Copy,
  Check,
  MapPin,
  Calendar,
  Users,
  Loader2,
  Lock,
  ArrowLeft,
  MessageSquare,
  Clock,
  Plus,
  CheckCircle2,
  UserCheck,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (!startDate && !endDate) return null;
  const fmt = (d: string) => {
    try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
  };
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `From ${fmt(startDate)}`;
  if (endDate) return `Until ${fmt(endDate)}`;
  return null;
}

function getInitials(displayName: string | null | undefined): string {
  if (!displayName) return "?";
  return displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MemberAvatar({ member }: { member: TripMember }) {
  const isCoordinator = member.role === "coordinator";
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-shrink-0">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.displayName ?? "Member"}
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
            {getInitials(member.displayName)}
          </div>
        )}
        {isCoordinator && (
          <span className="absolute -bottom-0.5 -right-0.5 bg-amber-400 rounded-full p-0.5">
            <Crown className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {member.displayName ?? "Member"}
        </span>
        {isCoordinator && (
          <span className="text-[10px] text-amber-600 font-semibold tracking-wider uppercase">
            Coordinator
          </span>
        )}
      </div>
    </div>
  );
}

function CopyInviteLinkButton({ tripId, inviteToken }: { tripId: number; inviteToken: string }) {
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  const handleCopy = () => {
    const url = `${window.location.origin}${basePath}/trips/${tripId}?invite=${inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast({ title: "Invite link copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ title: "Failed to copy link", variant: "destructive" });
    });
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2" data-testid="button-copy-invite">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied!" : "Copy invite link"}
    </Button>
  );
}

function DecisionStatusBadge({ status }: { status: string }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Done
      </span>
    );
  }
  if (status === "assigned") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
        <UserCheck className="h-2.5 w-2.5" />
        Assigned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 bg-muted text-muted-foreground border border-border">
      Open
    </span>
  );
}

function DecisionCard({ decision, tripId, inviteToken }: { decision: GroupDecision; tripId: number; inviteToken?: string }) {
  const href = `/trips/${tripId}/decisions/${decision.id}${inviteToken ? `?invite=${inviteToken}` : ""}`;
  return (
    <Link href={href}>
      <div className="flex items-center justify-between gap-3 p-4 border border-border hover:bg-accent/40 transition-colors cursor-pointer group">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground truncate leading-snug">
            {decision.question}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <DecisionStatusBadge status={decision.status} />
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  );
}

function CreateDecisionDialog({ tripId, onCreated }: { tripId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const { toast } = useToast();
  const createDecision = useCreateGroupDecision();

  const handleCreate = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    try {
      await createDecision.mutateAsync({ id: tripId, data: { question: trimmed } });
      setQuestion("");
      setOpen(false);
      onCreated();
      toast({ title: "Decision room created" });
    } catch {
      toast({ title: "Failed to create decision room", variant: "destructive" });
    }
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-3.5 w-3.5" />
        New decision
      </Button>
    );
  }

  return (
    <div className="border border-border p-4 space-y-3 bg-card">
      <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">New decision room</p>
      <textarea
        className="w-full border border-border bg-background text-foreground text-sm px-3 py-2 resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="What does the group need to decide? e.g. Sicily vs Tokyo for June, or how to structure 10 days in Japan..."
        value={question}
        onChange={e => setQuestion(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setQuestion(""); }}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleCreate}
          disabled={!question.trim() || createDecision.isPending}
          className="gap-2"
        >
          {createDecision.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create
        </Button>
      </div>
    </div>
  );
}

export default function TripDetail() {
  const { id } = useParams<{ id: string }>();
  const tripId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const joinTrip = useJoinTrip();
  const hasAutoJoined = useRef(false);

  const searchStr = window.location.search;
  const params = new URLSearchParams(searchStr);
  const inviteToken = params.get("invite") ?? undefined;

  const tripParams = inviteToken ? { invite: inviteToken } : undefined;
  const { data: trip, isLoading, isError } = useGetTrip(tripId, tripParams);

  const { data: decisions = [] } = useListGroupDecisions(tripId, tripParams);

  useEffect(() => {
    if (!isLoaded || !trip || !user || !inviteToken || hasAutoJoined.current) return;
    if (!trip.isGuest) return;

    hasAutoJoined.current = true;
    joinTrip.mutateAsync({
      id: tripId,
      data: {
        inviteToken,
        displayName: user.fullName ?? user.firstName ?? null,
        avatarUrl: user.imageUrl ?? null,
      },
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
      queryClient.invalidateQueries({ queryKey: getListGroupDecisionsQueryKey(tripId) });
      toast({ title: "You've joined the trip!" });
    }).catch(() => {
      hasAutoJoined.current = false;
    });
  }, [isLoaded, trip, user, inviteToken, tripId]);

  if (!isLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !trip) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <Link href="/trips">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to trips
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Lock className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-foreground mb-1">This trip is private</p>
          <p className="text-sm text-muted-foreground">You need an invite link to access this trip.</p>
        </div>
      </div>
    );
  }

  const isCoordinator = trip.currentUserRole === "coordinator";
  const isGuest = trip.isGuest;
  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const coordinatorMember = trip.members.find((m) => m.role === "coordinator");
  const regularMembers = trip.members.filter((m) => m.role !== "coordinator");

  const openCount = decisions.filter(d => d.status === "undecided").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Back nav */}
      {!isGuest && (
        <Link href="/trips">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground" data-testid="link-back-trips">
            <ArrowLeft className="h-4 w-4" />
            All trips
          </Button>
        </Link>
      )}

      {/* Guest banner */}
      {isGuest && (
        <div className="border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground text-sm">You're viewing this trip as a guest</p>
            <p className="text-sm text-muted-foreground mt-0.5">Sign up or sign in to participate, comment, and have your saves included in verdicts.</p>
          </div>
          <Button size="sm" asChild>
            <a href={`${basePath}/sso-callback`} onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}>
              Sign up to participate
            </a>
          </Button>
        </div>
      )}

      {/* Trip header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground" data-testid="title-trip-name">{trip.name}</h1>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {trip.destination && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">{trip.destination}</span>
                </span>
              )}
              {dateRange && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-4 w-4 flex-shrink-0" />
                  <span>{dateRange}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-muted-foreground" title={`Last activity: ${new Date(trip.lastActivityAt).toLocaleString()}`}>
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span>Active {formatDistanceToNow(new Date(trip.lastActivityAt), { addSuffix: true })}</span>
              </span>
            </div>
          </div>
          {isCoordinator && (
            <CopyInviteLinkButton tripId={trip.id} inviteToken={trip.inviteToken} />
          )}
        </div>
      </div>

      {/* Overview link */}
      <div className="border border-border bg-muted/20 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Trip Overview
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            See all booked decisions, pending bookings, and practical notes in one place
          </p>
        </div>
        <Link href={`/trips/${trip.id}/overview${isGuest && inviteToken ? `?invite=${inviteToken}` : ""}`}>
          <Button variant="outline" size="sm" className="gap-2 flex-shrink-0" data-testid="link-overview">
            View overview
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        {/* Decisions section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Decision rooms
            </h2>
            <span className="text-sm text-muted-foreground">
              {openCount === 0 ? "None open" : `${openCount} open`}
            </span>
          </div>

          {isCoordinator && (
            <CreateDecisionDialog
              tripId={trip.id}
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: getListGroupDecisionsQueryKey(tripId) });
                queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
              }}
            />
          )}

          {decisions.length === 0 ? (
            <div className="border border-dashed border-border p-10 flex flex-col items-center justify-center text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium text-sm">No decision rooms yet</p>
              {isCoordinator ? (
                <p className="text-xs text-muted-foreground/60 mt-1">Create one above to start planning together.</p>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-1">The coordinator will create decision rooms when the group is ready.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {decisions.map(decision => (
                <DecisionCard
                  key={decision.id}
                  decision={decision}
                  tripId={trip.id}
                  inviteToken={inviteToken}
                />
              ))}
            </div>
          )}
        </div>

        {/* Members sidebar */}
        <div className="space-y-4">
          <h2 className="text-lg font-serif font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Members
            <span className="ml-auto text-sm font-normal text-muted-foreground">{trip.members.length}</span>
          </h2>
          <div className="space-y-3">
            {coordinatorMember && <MemberAvatar member={coordinatorMember} />}
            {regularMembers.map((m) => (
              <MemberAvatar key={m.userId} member={m} />
            ))}
          </div>
          {isCoordinator && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground/60 font-semibold tracking-widest uppercase mb-2">Invite link</p>
              <CopyInviteLinkButton tripId={trip.id} inviteToken={trip.inviteToken} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
