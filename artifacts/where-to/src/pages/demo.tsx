import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Compass, Loader2, MapPin, Sparkles, ArrowRight, Users, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignIn } from "@clerk/react/legacy";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = `${basePath}/api`;

interface DemoSave {
  id: number;
  scrapedTitle: string | null;
  placeName: string | null;
  countryCode: string | null;
  tags: string[] | null;
  category: string | null;
}

interface DemoDecision {
  id: number;
  question: string;
  resultJson: {
    type: string;
    verdict: string;
    travelPatterns: string[];
  } | null;
  createdAt: string;
}

interface DemoProfile {
  id: string;
  name: string;
  initials: string;
  bio: string;
  travelStyle: string;
  saves: DemoSave[];
  decisions: DemoDecision[];
}

interface DemoTripPreview {
  id: number;
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  members: { name: string; initials: string; role: string }[];
  decisions: { status: string; verdictJson: { verdict: string } | null }[];
}

interface DemoData {
  profiles: DemoProfile[];
  demoTrips: DemoTripPreview[];
  seeded: boolean;
}

function formatDateShort(d: string | null) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function Demo() {
  const [data, setData] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(true);
  const { signIn, isLoaded } = useSignIn();

  useEffect(() => {
    fetch(`${API_BASE}/demo`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
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

  const totalDecisions = data?.profiles.reduce((sum, p) => sum + p.decisions.length, 0) ?? 0;
  const totalSaves = data?.profiles.reduce((sum, p) => sum + p.saves.length, 0) ?? 0;

  return (
    <div className="min-h-[100dvh] bg-background">

      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
          <Compass className="h-5 w-5 text-primary" />
          <span className="font-serif font-bold text-base">Where To</span>
        </Link>
        <Button size="sm" onClick={handleGoogleSignIn} disabled={!isLoaded}>
          Start with your saves
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-14 space-y-20">

        {/* Intro */}
        <div className="max-w-2xl space-y-5">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">See it in action</p>
          <h1 className="text-4xl md:text-5xl font-serif text-foreground leading-tight">
            Five travelers. Real saves. Real AI decisions.
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            These demo profiles show how Where To works — different travel styles, different questions, one decisive answer each time.
          </p>
          {data?.seeded && (
            <div className="flex gap-6 text-sm text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {totalSaves} saves
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {totalDecisions} decisions
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {data.demoTrips.length} group trips
              </span>
            </div>
          )}
        </div>

        {/* Solo profiles */}
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Solo profiles</p>
            <h2 className="text-2xl font-serif text-foreground">Five travel styles. Every question answered.</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.seeded ? (
            <div className="border border-dashed border-border p-10 text-center space-y-3">
              <p className="text-muted-foreground font-medium">Demo profiles haven't been seeded yet.</p>
              <p className="text-sm text-muted-foreground">Run <code className="bg-muted px-1.5 py-0.5 text-xs">pnpm run seed-demo</code> in the API server to generate them.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-5">
              {data.profiles.map(profile => (
                <ProfileCard key={profile.id} profile={profile} />
              ))}
            </div>
          )}
        </div>

        {/* Group trips */}
        {data?.seeded && data.demoTrips.length > 0 && (
          <div className="space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Group trips</p>
              <h2 className="text-2xl font-serif text-foreground">Three trips. Real group decisions. No compromise.</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {data.demoTrips.map(trip => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="border border-border p-8 md:p-12 space-y-5 bg-card">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Ready to decide?</p>
          <h2 className="text-2xl font-serif text-foreground">This works better with your own saves.</h2>
          <p className="text-muted-foreground max-w-lg">
            Add the places you've been thinking about — links, notes, just names — and get a verdict built around your actual travel patterns.
          </p>
          <Button size="lg" className="px-8" onClick={handleGoogleSignIn} disabled={!isLoaded}>
            Start with Google
          </Button>
        </div>

      </main>
    </div>
  );
}

function ProfileCard({ profile }: { profile: DemoProfile }) {
  const topTags = Array.from(
    new Set(profile.saves.flatMap(s => s.tags ?? []))
  ).slice(0, 4);

  return (
    <Link href={`/demo/${profile.id}`} className="block group">
      <div className="border border-border bg-card p-6 space-y-5 hover:border-primary/40 transition-colors h-full">

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/15 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-primary">{profile.initials}</span>
          </div>
          <div>
            <p className="font-semibold text-foreground">{profile.name}</p>
            <p className="text-xs text-muted-foreground">{profile.travelStyle}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {profile.saves.length} saves
          </span>
          <span className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {profile.decisions.length} decisions
          </span>
        </div>

        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topTags.map(tag => (
              <span key={tag} className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground/70 border border-border px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}

        {profile.decisions[0]?.resultJson && (
          <div className="pt-3 border-t border-border space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">Latest verdict</p>
            <p className="text-sm font-serif text-foreground leading-snug">
              {profile.decisions[0].resultJson.verdict}
            </p>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
          View decisions <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </Link>
  );
}

function TripCard({ trip }: { trip: DemoTripPreview }) {
  const bookedCount = trip.decisions.filter(d => d.status === "done").length;
  const openCount = trip.decisions.filter(d => d.status !== "done").length;
  const start = formatDateShort(trip.startDate);
  const end = formatDateShort(trip.endDate);
  const latestVerdict = trip.decisions.find(d => d.verdictJson)?.verdictJson;

  return (
    <Link href={`/demo/trip/${trip.id}`} className="block group">
      <div className="border border-border bg-card p-6 space-y-5 hover:border-primary/40 transition-colors h-full">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="font-semibold text-foreground leading-tight">{trip.name}</p>
            {trip.destination && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {trip.destination}
              </p>
            )}
            {start && end && (
              <p className="text-xs text-muted-foreground">{start} – {end}</p>
            )}
          </div>
          <div className="flex -space-x-1.5 shrink-0">
            {trip.members.slice(0, 3).map((m, i) => (
              <div key={i} className="h-8 w-8 bg-primary/10 border-2 border-background flex items-center justify-center rounded-full">
                <span className="text-[10px] font-bold text-primary">{m.initials}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {trip.members.length} travellers
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            {bookedCount} booked
          </span>
          {openCount > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-500" />
              {openCount} open
            </span>
          )}
        </div>

        {/* Latest verdict preview */}
        {latestVerdict && (
          <div className="pt-3 border-t border-border space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">Latest verdict</p>
            <p className="text-sm font-serif text-foreground leading-snug line-clamp-2">
              {latestVerdict.verdict}
            </p>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs text-primary font-medium group-hover:gap-2 transition-all">
          See the full trip <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </Link>
  );
}
