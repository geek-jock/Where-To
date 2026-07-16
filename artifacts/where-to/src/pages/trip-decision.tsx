import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetGroupDecision,
  useCreateDecisionComment,
  useRunGroupVerdict,
  useAssignGroupDecision,
  useConfirmGroupDecision,
  getGetGroupDecisionQueryKey,
  getListGroupDecisionsQueryKey,
  getGetTripQueryKey,
} from "@workspace/api-client-react";
import type { GroupDecisionDetail, TripMember, GroupVerdictJson } from "@workspace/api-client-react";
import {
  ArrowLeft,
  Loader2,
  Send,
  Crown,
  CheckCircle2,
  Zap,
  UserCheck,
  Lock,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { VerdictDisplay } from "@/components/verdict-display";
import { GroupVerdictDownloadButton } from "@/components/share-cards";

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Done
      </span>
    );
  }
  if (status === "assigned") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200">
        <UserCheck className="h-3 w-3" />
        Assigned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 bg-muted text-muted-foreground border border-border">
      Undecided
    </span>
  );
}

function CommentThread({
  decision,
  canComment,
  tripId,
  decId,
  user,
}: {
  decision: GroupDecisionDetail;
  canComment: boolean;
  tripId: number;
  decId: number;
  user: any;
}) {
  const [text, setText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const postComment = useCreateDecisionComment();

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await postComment.mutateAsync({
        id: tripId,
        decId,
        data: {
          content: trimmed,
          displayName: user?.fullName ?? user?.firstName ?? undefined,
          avatarUrl: user?.imageUrl ?? undefined,
        },
      });
      setText("");
      queryClient.invalidateQueries({ queryKey: getGetGroupDecisionQueryKey(tripId, decId) });
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePost();
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
        Discussion ({decision.comments.length})
      </h3>

      {decision.comments.length === 0 && !canComment && (
        <p className="text-sm text-muted-foreground text-center py-4">No comments yet.</p>
      )}

      <div className="space-y-4">
        {decision.comments.map(comment => {
          const name = comment.displayName ?? comment.userId.slice(0, 8);
          return (
            <div key={comment.id} className="flex gap-3">
              {comment.avatarUrl ? (
                <img src={comment.avatarUrl} alt={name} className="h-8 w-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0 mt-0.5">
                  {getInitials(name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{comment.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      {canComment && (
        <div className="space-y-2 pt-2 border-t border-border">
          <Textarea
            placeholder="Add a comment..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="resize-none min-h-[80px]"
            disabled={postComment.isPending}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handlePost}
              disabled={!text.trim() || postComment.isPending}
              className="gap-2"
            >
              {postComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post comment
            </Button>
          </div>
        </div>
      )}

      {!canComment && decision.status !== "done" && (
        <div className="pt-2 border-t border-border">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Sign in to participate in the discussion.
          </p>
        </div>
      )}
    </div>
  );
}

function CoordinatorControls({
  decision,
  tripId,
  decId,
  isCoordinator,
  currentUserId,
}: {
  decision: GroupDecisionDetail;
  tripId: number;
  decId: number;
  isCoordinator: boolean;
  currentUserId: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState("");

  const runVerdict = useRunGroupVerdict();
  const assign = useAssignGroupDecision();
  const confirm = useConfirmGroupDecision();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetGroupDecisionQueryKey(tripId, decId) });
    queryClient.invalidateQueries({ queryKey: getListGroupDecisionsQueryKey(tripId) });
    queryClient.invalidateQueries({ queryKey: getGetTripQueryKey(tripId) });
  };

  const handleRunVerdict = async () => {
    try {
      await runVerdict.mutateAsync({ id: tripId, decId });
      invalidate();
      toast({ title: "Verdict generated" });
    } catch {
      toast({ title: "Failed to run verdict", variant: "destructive" });
    }
  };

  const handleAssign = async () => {
    if (!selectedMember) return;
    try {
      await assign.mutateAsync({ id: tripId, decId, data: { assignedTo: selectedMember } });
      invalidate();
      toast({ title: "Decision assigned" });
    } catch {
      toast({ title: "Failed to assign", variant: "destructive" });
    }
  };

  const handleConfirm = async () => {
    try {
      await confirm.mutateAsync({ id: tripId, decId });
      invalidate();
      toast({ title: "Marked as booked!" });
    } catch {
      toast({ title: "Failed to confirm", variant: "destructive" });
    }
  };

  const memberOptions = decision.members.filter(m => m.userId !== undefined);
  const assignedMember = decision.assignedTo
    ? decision.members.find(m => m.userId === decision.assignedTo)
    : null;
  const isAssignee = currentUserId === decision.assignedTo;

  if (decision.status === "done") return null;

  return (
    <div className="space-y-4 p-5 border border-border bg-card">
      <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
        {isCoordinator ? "Coordinator actions" : "Your task"}
      </p>

      {isCoordinator && !decision.verdictJson && (
        <Button
          onClick={handleRunVerdict}
          disabled={runVerdict.isPending}
          className="gap-2 w-full sm:w-auto"
        >
          {runVerdict.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {runVerdict.isPending ? "Running verdict..." : "Run group verdict"}
        </Button>
      )}

      {isCoordinator && decision.verdictJson && decision.status === "undecided" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Assign this decision to a member:</p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={selectedMember}
              onChange={e => setSelectedMember(e.target.value)}
              className="border border-border bg-background text-foreground text-sm px-3 py-2 flex-1 min-w-0"
            >
              <option value="">Pick a member...</option>
              {memberOptions.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName ?? m.userId.slice(0, 8)}
                  {m.role === "coordinator" ? " (coordinator)" : ""}
                </option>
              ))}
            </select>
            <Button
              onClick={handleAssign}
              disabled={!selectedMember || assign.isPending}
              className="gap-2"
            >
              {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Assign
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRunVerdict}
            disabled={runVerdict.isPending}
            className="gap-2 text-muted-foreground"
          >
            {runVerdict.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Re-run verdict
          </Button>
        </div>
      )}

      {decision.status === "assigned" && assignedMember && (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            Assigned to <span className="font-semibold">{assignedMember.displayName ?? assignedMember.userId.slice(0, 8)}</span>
          </p>
          {(isAssignee || isCoordinator) && (
            <Button
              onClick={handleConfirm}
              disabled={confirm.isPending}
              className="gap-2"
            >
              {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm booked
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function GroupVerdictSection({ verdictJson, members, question }: { verdictJson: GroupVerdictJson; members: TripMember[]; question: string }) {
  const memberNameMap: Record<string, string> = {};
  for (const m of members) {
    memberNameMap[m.userId] = m.displayName ?? m.userId.slice(0, 8);
  }

  return (
    <div className="space-y-8">
      <VerdictDisplay
        question=""
        verdictJson={verdictJson}
      />

      {verdictJson.whoGetsWhat && verdictJson.whoGetsWhat.length > 0 && (
        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Who Gets What
          </p>
          <div className="space-y-3">
            {verdictJson.whoGetsWhat.map((item, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0 mt-0.5">
                  {getInitials(item.memberName)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.memberName}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.assignment}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {verdictJson.theSeam && (
        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            The Seam
          </p>
          <blockquote className="border-l-2 border-primary pl-5 text-foreground leading-relaxed italic">
            {verdictJson.theSeam}
          </blockquote>
        </div>
      )}

      <div className="flex justify-center pt-4 border-t border-border">
        <GroupVerdictDownloadButton question={question} verdictJson={verdictJson} />
      </div>
    </div>
  );
}

export default function TripDecision() {
  const { id, decId } = useParams<{ id: string; decId: string }>();
  const tripId = parseInt(id ?? "0");
  const decisionId = parseInt(decId ?? "0");
  const [, navigate] = useLocation();
  const { user, isLoaded } = useUser();

  const searchStr = window.location.search;
  const params = new URLSearchParams(searchStr);
  const inviteToken = params.get("invite") ?? undefined;

  const queryParams = inviteToken ? { invite: inviteToken } : undefined;

  const { data: decision, isLoading, isError } = useGetGroupDecision(
    tripId,
    decisionId,
    queryParams,
  );

  if (!isLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !decision) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <Link href={`/trips/${tripId}`}>
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to trip
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Lock className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-foreground mb-1">Decision not found</p>
          <p className="text-sm text-muted-foreground">You may not have access to this decision room.</p>
        </div>
      </div>
    );
  }

  const currentUserId = user?.id ?? null;
  const currentMember = decision.members.find(m => m.userId === currentUserId);
  const isMember = !!currentMember;
  const isCoordinator = currentMember?.role === "coordinator";
  const canComment = isMember && !!currentUserId;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <Link href={`/trips/${tripId}${inviteToken ? `?invite=${inviteToken}` : ""}`}>
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to trip
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
              Decision room
            </p>
            <h1 className="text-2xl font-serif font-bold text-foreground leading-snug">
              {decision.question}
            </h1>
          </div>
          <StatusBadge status={decision.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          Created {format(new Date(decision.createdAt), "MMMM d, yyyy")}
          {" · "}
          {decision.members.length} {decision.members.length === 1 ? "member" : "members"}
        </p>
      </div>

      {/* Done banner */}
      {decision.status === "done" && (
        <div className="border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800 text-sm">Booked and confirmed</p>
            <p className="text-sm text-emerald-700">This decision is done.</p>
          </div>
        </div>
      )}

      {/* Coordinator controls */}
      <CoordinatorControls
        decision={decision}
        tripId={tripId}
        decId={decisionId}
        isCoordinator={isCoordinator}
        currentUserId={currentUserId}
      />

      {/* Comment thread */}
      <CommentThread
        decision={decision}
        canComment={canComment}
        tripId={tripId}
        decId={decisionId}
        user={user}
      />

      {/* Verdict */}
      {decision.verdictJson ? (
        <div className="border-t border-border pt-8">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-6">
            Group Verdict
          </p>
          <GroupVerdictSection verdictJson={decision.verdictJson} members={decision.members} question={decision.question} />
        </div>
      ) : (
        <div className="border-t border-border pt-8 text-center">
          <p className="text-muted-foreground text-sm">
            {isCoordinator
              ? "No verdict yet. Discuss in the thread above, then run the group verdict."
              : "No verdict yet. The coordinator will run the verdict when the group is ready."}
          </p>
        </div>
      )}
    </div>
  );
}
