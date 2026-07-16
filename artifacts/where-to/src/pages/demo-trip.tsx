import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Compass, Loader2, ArrowLeft, MapPin, Calendar, Users, CheckCircle2, Clock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignIn } from "@clerk/react/legacy";
import type { GroupVerdictJson } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = `${basePath}/api`;

interface DemoComment {
  id: number;
  userId: string;
  displayName: string | null;
  content: string;
  createdAt: string;
}

interface DemoGroupDecision {
  id: number;
  question: string;
  status: string;
  verdictJson: GroupVerdictJson | null;
  assignedTo: string | null;
  costPerPax: string | null;
  confirmationLink: string | null;
  comments: DemoComment[];
}

interface DemoMember {
  userId: string;
  role: string;
  name: string;
  initials: string;
}

interface DemoTrip {
  id: number;
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  members: DemoMember[];
  decisions: DemoGroupDecision[];
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-green-700 bg-green-50 border border-green-200 px-2 py-0.5">
        <CheckCircle2 className="h-3 w-3" />
        Booked
      </span>
    );
  }
  if (status === "assigned") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5">
        <Clock className="h-3 w-3" />
        Needs booking
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground bg-muted border border-border px-2 py-0.5">
      <MessageSquare className="h-3 w-3" />
      Open question
    </span>
  );
}

function WhoGetsWhatSection({ items }: { items: GroupVerdictJson["whoGetsWhat"] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">Who gets what</p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="font-medium text-foreground shrink-0">{item.memberName}</span>
            <span className="text-muted-foreground">—</span>
            <span className="text-muted-foreground italic">{item.assignment}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionCard({ dec, members }: { dec: DemoGroupDecision; members: DemoMember[] }) {
  const assigneeMember = members.find(m => m.userId === dec.assignedTo);

  return (
    <div className="border border-border bg-card">
      {/* Decision header */}
      <div className="p-6 border-b border-border space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-serif text-lg text-foreground leading-snug">{dec.question}</h3>
          <StatusBadge status={dec.status} />
        </div>
        {dec.status !== "undecided" && assigneeMember && (
          <p className="text-xs text-muted-foreground">
            {dec.status === "done" ? "Booked by" : "Assigned to"}{" "}
            <span className="font-medium text-foreground">{assigneeMember.name}</span>
            {dec.costPerPax && <span className="ml-2 text-muted-foreground">· {dec.costPerPax} / person</span>}
          </p>
        )}
      </div>

      {/* Verdict */}
      {dec.verdictJson ? (
        <div className="p-6 border-b border-border space-y-6">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-primary/70">The verdict</p>
            <h4 className="font-serif text-2xl text-foreground leading-tight">{dec.verdictJson.verdict}</h4>
          </div>

          {dec.verdictJson.whyThisFits && (
            <p className="text-sm text-muted-foreground leading-relaxed">{dec.verdictJson.whyThisFits}</p>
          )}

          <WhoGetsWhatSection items={dec.verdictJson.whoGetsWhat} />

          {dec.verdictJson.theSeam && (
            <blockquote className="border-l-2 border-primary pl-4 italic text-sm text-muted-foreground leading-relaxed">
              {dec.verdictJson.theSeam}
            </blockquote>
          )}
        </div>
      ) : (
        <div className="p-6 border-b border-border">
          <p className="text-sm text-muted-foreground italic">No verdict yet — the group is still discussing.</p>
        </div>
      )}

      {/* Comments */}
      {dec.comments.length > 0 && (
        <div className="p-6 space-y-4">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">
            Discussion · {dec.comments.length}
          </p>
          <div className="space-y-3">
            {dec.comments.map(comment => {
              const member = members.find(m => m.userId === comment.userId);
              return (
                <div key={comment.id} className="flex gap-3">
                  <div className="h-7 w-7 bg-primary/10 flex items-center justify-center flex-shrink-0 rounded-full">
                    <span className="text-[10px] font-bold text-primary">
                      {member?.initials ?? comment.displayName?.slice(0, 2).toUpperCase() ?? "?"}
                    </span>
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {comment.displayName ?? member?.name ?? comment.userId}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{comment.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DemoTrip() {
  const [trip, setTrip] = useState<DemoTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const { signIn, isLoaded } = useSignIn();

  useEffect(() => {
    fetch(`${API_BASE}/demo`)
      .then(r => r.json())
      .then((data: { demoTrip?: DemoTrip | null }) => {
        setTrip(data.demoTrip ?? null);
      })
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn) return;
    await signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: `${window.location.origin}${basePath}/sso-callback`,
      redirectUrlComplete: `${window.location.origin}${basePath}/`,
    });
  }

  const start = formatDate(trip?.startDate ?? null);
  const end = formatDate(trip?.endDate ?? null);

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
          <Compass className="h-5 w-5 text-primary" />
          <span className="font-serif font-bold text-base">Where To</span>
        </Link>
        <Button size="sm" onClick={handleGoogleSignIn} disabled={!isLoaded}>
          Start planning your trip
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !trip ? (
        <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-4">
          <p className="text-muted-foreground">Demo trip not found. Run the seed script to generate it.</p>
          <Link href="/demo" className="text-primary hover:underline text-sm">← Back to demo</Link>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-10">

          {/* Back */}
          <Link href="/demo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            All demo profiles
          </Link>

          {/* Trip header */}
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Group trip</p>
              <h1 className="text-3xl md:text-4xl font-serif text-foreground">{trip.name}</h1>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {trip.destination && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {trip.destination}
                </span>
              )}
              {start && end && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {start} – {end}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {trip.members.length} travellers
              </span>
            </div>

            {/* Members */}
            <div className="flex items-center gap-3 flex-wrap">
              {trip.members.map(m => (
                <div key={m.userId} className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-primary/10 flex items-center justify-center flex-shrink-0 rounded-full">
                    <span className="text-[10px] font-bold text-primary">{m.initials}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground leading-none">{m.name}</p>
                    {m.role === "coordinator" && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">coordinator</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-muted/40 border border-border p-5 space-y-2">
            <p className="text-sm font-medium text-foreground">How group decisions work</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The coordinator opens a question. Members discuss in comments. When ready, Where To reads everyone's personal saves and travel profiles to generate a verdict — with a specific assignment for each person. Someone confirms it's booked.
            </p>
          </div>

          {/* Decision rooms */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
              Decisions · {trip.decisions.length}
            </h2>
            <div className="space-y-4">
              {trip.decisions.map(dec => (
                <DecisionCard key={dec.id} dec={dec} members={trip.members} />
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="border border-border p-8 md:p-10 space-y-4 bg-card">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Plan a trip with your group</p>
            <h2 className="text-2xl font-serif text-foreground">
              Every person brings their saves. The AI assigns everyone something they'll actually want.
            </h2>
            <p className="text-muted-foreground max-w-lg text-sm leading-relaxed">
              Create a trip, share the invite link, and let the verdict engine read your combined saves to find what works for the whole group — without the compromise.
            </p>
            <Button size="lg" className="px-8" onClick={handleGoogleSignIn} disabled={!isLoaded}>
              Start planning
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}
