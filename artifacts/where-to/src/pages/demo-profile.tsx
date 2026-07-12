import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Compass, Loader2, MapPin, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictDisplay } from "@/components/verdict-display";
import { format } from "date-fns";
import { useSignIn } from "@clerk/react/legacy";
import type { VerdictJson } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = `${basePath}/api`;

interface DemoSave {
  id: number;
  scrapedTitle: string | null;
  scrapedDescription: string | null;
  placeName: string | null;
  countryCode: string | null;
  tags: string[] | null;
  category: string | null;
}

interface DemoDecision {
  id: number;
  question: string;
  result: string;
  resultJson: VerdictJson | null;
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

export default function DemoProfile() {
  const { profileId } = useParams<{ profileId: string }>();
  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDecisionId, setActiveDecisionId] = useState<number | null>(null);
  const { signIn, isLoaded } = useSignIn();

  useEffect(() => {
    fetch(`${API_BASE}/demo`)
      .then(r => r.json())
      .then((data: { profiles: DemoProfile[] }) => {
        const found = data.profiles.find(p => p.id === profileId);
        setProfile(found ?? null);
        if (found?.decisions?.[0]) {
          setActiveDecisionId(found.decisions[0].id);
        }
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [profileId]);

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn) return;
    await signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: `${window.location.origin}${basePath}/sso-callback`,
      redirectUrlComplete: `${window.location.origin}${basePath}/`,
    });
  }

  const activeDecision = profile?.decisions.find(d => d.id === activeDecisionId) ?? null;

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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !profile ? (
        <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-4">
          <p className="text-muted-foreground">Profile not found.</p>
          <Link href="/demo" className="text-primary hover:underline text-sm">← Back to demo profiles</Link>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">

          {/* Back link */}
          <Link href="/demo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="h-3.5 w-3.5" />
            All demo profiles
          </Link>

          <div className="grid md:grid-cols-[300px_1fr] gap-10">

            {/* Sidebar — profile + saves + decision list */}
            <aside className="space-y-8">

              {/* Profile card */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-primary">{profile.initials}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{profile.name}</p>
                    <p className="text-xs text-muted-foreground">{profile.travelStyle}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{profile.bio}</p>
              </div>

              {/* Saves */}
              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  Library — {profile.saves.length} saves
                </p>
                <div className="space-y-1">
                  {profile.saves.map(save => (
                    <div key={save.id} className="flex items-center gap-2 py-1.5">
                      <span className="text-sm text-foreground">
                        {save.scrapedTitle || save.placeName || "Save"}
                      </span>
                      {save.countryCode && (
                        <span className="text-xs text-muted-foreground/60">{save.countryCode}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Decision list */}
              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
                  Decisions — {profile.decisions.length}
                </p>
                <div className="space-y-1">
                  {profile.decisions.map(decision => (
                    <button
                      key={decision.id}
                      onClick={() => setActiveDecisionId(decision.id)}
                      className={`w-full text-left px-3 py-2.5 space-y-0.5 transition-colors border ${
                        activeDecisionId === decision.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent hover:bg-muted/50"
                      }`}
                    >
                      <p className="text-xs text-muted-foreground/60">
                        {format(new Date(decision.createdAt), "MMM d, yyyy")}
                        {decision.resultJson?.type && (
                          <span className="ml-2 uppercase tracking-wider text-[9px]">
                            {decision.resultJson.type === "structure" ? "Structure" : "Choose"}
                          </span>
                        )}
                      </p>
                      {decision.resultJson?.verdict ? (
                        <p className="text-sm font-serif text-foreground leading-snug">
                          {decision.resultJson.verdict}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic truncate">
                          {decision.question.slice(0, 60)}...
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

            </aside>

            {/* Main — active decision verdict */}
            <div className="min-h-[400px]">
              {!activeDecision ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Select a decision to read the verdict.
                </div>
              ) : activeDecision.resultJson ? (
                <VerdictDisplay
                  question={activeDecision.question}
                  verdictJson={activeDecision.resultJson}
                  createdAt={activeDecision.createdAt}
                />
              ) : (
                <div className="space-y-4 max-w-2xl">
                  <blockquote className="text-xl font-serif italic text-foreground border-l-2 border-primary pl-5 leading-snug">
                    {activeDecision.question}
                  </blockquote>
                  <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
                    {activeDecision.result}
                  </pre>
                </div>
              )}

              {/* CTA at bottom of verdict */}
              {activeDecision && (
                <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                  <p className="text-sm text-muted-foreground max-w-sm">
                    This is a real AI verdict. Yours would be built from your own saves and travel patterns.
                  </p>
                  <Button onClick={handleGoogleSignIn} disabled={!isLoaded}>
                    Start with your saves
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
