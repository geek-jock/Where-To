import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { VerdictJson } from "@workspace/api-client-react";

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-foreground">
          <span className="text-primary mt-1 flex-shrink-0 text-base leading-none">•</span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
      {children}
    </p>
  );
}

interface VerdictDisplayProps {
  question: string;
  verdictJson: VerdictJson;
  createdAt?: string;
  backHref?: string;
  onNewDecision?: () => void;
  savesMap?: Record<number, string>;
}

export function VerdictDisplay({ question, verdictJson, createdAt, backHref, onNewDecision, savesMap }: VerdictDisplayProps) {
  const saveCount = verdictJson.usedSaveIds.length;

  return (
    <div className="space-y-12 max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500 pb-28">

      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to history
        </Link>
      )}

      {/* Question */}
      {question && (
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">The Question</p>
          <blockquote className="text-xl font-serif italic text-foreground border-l-2 border-primary pl-5 leading-snug">
            {question}
          </blockquote>
          <div className="pl-5 flex items-center gap-3">
            {verdictJson.type && (
              <span className="inline-block text-[10px] font-medium tracking-wider uppercase text-muted-foreground/70 border border-border rounded-full px-2.5 py-0.5">
                {verdictJson.type === "structure" ? "Building a trip" : "Choosing between options"}
              </span>
            )}
            {createdAt && (
              <p className="text-xs text-muted-foreground">
                {format(new Date(createdAt), "MMMM d, yyyy")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Verdict — dominant headline */}
      <div className="py-8 border-t border-b border-border space-y-3">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary">The Verdict</p>
        <h2 className="text-4xl md:text-5xl font-serif text-foreground leading-tight">
          {verdictJson.verdict}
        </h2>
      </div>

      {/* Body sections */}
      <div className="space-y-10">

        <div className="space-y-3">
          <SectionLabel>Your Travel Patterns</SectionLabel>
          <BulletList items={verdictJson.travelPatterns} />
        </div>

        <div className="space-y-3">
          <SectionLabel>Your Core Conflict</SectionLabel>
          <p className="text-foreground leading-relaxed">{verdictJson.coreConflict}</p>
        </div>

        <div className="space-y-3">
          <SectionLabel>What You're Missing</SectionLabel>
          <p className="text-foreground leading-relaxed">{verdictJson.whatYoureMissing}</p>
        </div>

        <div className="space-y-3">
          <SectionLabel>Why This Fits You</SectionLabel>
          <p className="text-foreground leading-relaxed">{verdictJson.whyThisFits}</p>
        </div>

        <div className="space-y-3">
          <SectionLabel>Tradeoffs</SectionLabel>
          <p className="text-foreground leading-relaxed">{verdictJson.tradeoffs}</p>
        </div>

        <div className="space-y-3">
          <SectionLabel>Avoid If</SectionLabel>
          <BulletList items={verdictJson.avoidIf} />
        </div>

      </div>

      {/* Action block */}
      <div className="bg-card border border-border p-6 md:p-8 space-y-7">
        <p className="text-xs font-semibold tracking-widest uppercase text-primary">Action Plan</p>

        <div className="space-y-2">
          <SectionLabel>Your Next Move</SectionLabel>
          <p className="text-lg font-serif text-foreground leading-relaxed">{verdictJson.nextMove}</p>
        </div>

        <div className="space-y-2">
          <SectionLabel>Start Here — 3 Anchors</SectionLabel>
          <ol className="space-y-2">
            {verdictJson.anchors.map((anchor, i) => (
              <li key={i} className="flex gap-2.5 text-foreground">
                <span className="text-primary font-semibold flex-shrink-0 w-4">{i + 1}.</span>
                <span className="leading-relaxed">{anchor}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <SectionLabel>Timing Confidence</SectionLabel>
          <p className="text-foreground leading-relaxed">{verdictJson.timingConfidence}</p>
        </div>

        <div className="space-y-2">
          <SectionLabel>Stop Doing This</SectionLabel>
          <p className="text-foreground leading-relaxed border-l-4 border-red-500 pl-4">
            {verdictJson.stopDoingThis}
          </p>
        </div>
      </div>

      {/* Based on your saves footer */}
      {saveCount > 0 && (
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Based on {saveCount === 1 ? "1 of your saves" : `${saveCount} of your saves`}</p>
          <p className="text-muted-foreground/60 leading-relaxed">
            {verdictJson.usedSaveIds.map(id => {
              const label = savesMap?.[id];
              return label ?? `#${id}`;
            }).join(" · ")}
          </p>
        </div>
      )}

      {/* Footer actions */}
      {(backHref || onNewDecision) && (
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          {backHref && (
            <Button variant="outline" asChild>
              <Link href="/history">View all decisions</Link>
            </Button>
          )}
          {onNewDecision && (
            <Button variant="outline" onClick={onNewDecision}>
              Ask something else
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
