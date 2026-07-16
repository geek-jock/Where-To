import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Compass, Loader2, ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerdictDisplay } from "@/components/verdict-display";
import { useSignIn } from "@clerk/react/legacy";
import type { VerdictJson } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = `${basePath}/api`;

interface DemoSave {
  id: number;
  url: string | null;
  note: string | null;
  scrapedTitle: string | null;
  description: string | null;
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

function getDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "maps.app.goo.gl") return "google maps";
    if (host.startsWith("reddit.com")) return "reddit";
    if (host.startsWith("instagram.com")) return "instagram";
    if (host.startsWith("youtube.com")) return "youtube";
    if (host.startsWith("airbnb.com")) return "airbnb";
    if (host.startsWith("booking.com")) return "booking.com";
    if (host.startsWith("alltrails.com")) return "alltrails";
    return host;
  } catch {
    return null;
  }
}

export default function DemoProfile() {
  const { profileId } = useParams<{ profileId: string }>();
  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"question" | "library">("question");
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
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-10 md:py-14">

          {/* Back */}
          <Link href="/demo" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="h-3.5 w-3.5" />
            All demo profiles
          </Link>

          {/* Profile card */}
          <div className="flex items-start gap-4 mb-10">
            <div className="h-12 w-12 bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-primary">{profile.initials}</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">{profile.name}</p>
              <p className="text-xs text-muted-foreground">{profile.travelStyle}</p>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-xl">{profile.bio}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-border mb-8">
            <div className="flex gap-0">
              {(["question", "library"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                    activeTab === tab
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "question"
                    ? `Question · ${profile.decisions.length}`
                    : `Library · ${profile.saves.length}`}
                </button>
              ))}
            </div>
          </div>

          {/* Question tab */}
          {activeTab === "question" && (
            <div className="space-y-8">
              {/* Question selector */}
              {profile.decisions.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {profile.decisions.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setActiveDecisionId(d.id)}
                      className={`px-3 py-1.5 text-xs border transition-colors text-left ${
                        activeDecisionId === d.id
                          ? "border-primary/50 bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                      }`}
                    >
                      {d.resultJson?.verdict ?? d.question.slice(0, 50) + "…"}
                    </button>
                  ))}
                </div>
              )}

              {/* Active verdict */}
              {activeDecision?.resultJson ? (
                <VerdictDisplay
                  question={activeDecision.question}
                  verdictJson={activeDecision.resultJson}
                  createdAt={activeDecision.createdAt}
                />
              ) : activeDecision ? (
                <div className="space-y-4 max-w-2xl">
                  <blockquote className="text-xl font-serif italic text-foreground border-l-2 border-primary pl-5 leading-snug">
                    {activeDecision.question}
                  </blockquote>
                  <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
                    {activeDecision.result}
                  </pre>
                </div>
              ) : null}

              {/* CTA */}
              {activeDecision && (
                <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                  <p className="text-sm text-muted-foreground max-w-sm">
                    This is a real AI verdict, built from {profile.name.split(" ")[0]}'s saves. Yours would come from your own.
                  </p>
                  <Button onClick={handleGoogleSignIn} disabled={!isLoaded}>
                    Start with your saves
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Library tab */}
          {activeTab === "library" && (
            <div className="space-y-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-6 text-xs font-semibold tracking-widest uppercase text-muted-foreground/60 font-sans w-32">Place</th>
                    <th className="pb-3 pr-6 text-xs font-semibold tracking-widest uppercase text-muted-foreground/60 font-sans">Note &amp; Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.saves.map(save => {
                    const domain = getDomain(save.url);
                    return (
                      <tr key={save.id} className="group">
                        <td className="py-4 pr-6 align-top">
                          <span className="font-medium text-foreground text-sm">{save.placeName}</span>
                          {save.countryCode && (
                            <span className="text-muted-foreground/50 ml-1.5 text-xs">{save.countryCode}</span>
                          )}
                        </td>
                        <td className="py-4 align-top">
                          <p className="text-sm text-muted-foreground leading-relaxed mb-2">{save.note}</p>
                          {save.url && (
                            <a
                              href={save.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1.5 group/link max-w-sm"
                            >
                              <ExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover/link:text-primary flex-shrink-0 mt-0.5 transition-colors" />
                              <span className="text-xs leading-snug">
                                <span className="text-foreground/80 group-hover/link:text-primary transition-colors line-clamp-2">
                                  {save.scrapedTitle ?? domain ?? save.url}
                                </span>
                                {domain && save.scrapedTitle && (
                                  <span className="block text-muted-foreground/50 mt-0.5">{domain}</span>
                                )}
                              </span>
                            </a>
                          )}
                          {save.tags && save.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2.5">
                              {save.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="text-[10px] text-muted-foreground/50 border border-border/50 px-1.5 py-0.5">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* CTA */}
              <div className="pt-10 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between mt-8">
                <p className="text-sm text-muted-foreground max-w-sm">
                  Save links like these — then ask Where To to decide.
                </p>
                <Button onClick={handleGoogleSignIn} disabled={!isLoaded}>
                  Start with your saves
                </Button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
