import { useGetDecision } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { parseDecision } from "@/lib/decision-parser";

export default function DecisionView() {
  const params = useParams();
  const id = Number(params.id);
  
  const { data: decision, isLoading, error } = useGetDecision(id);

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !decision) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Decision not found.</p>
        <Link href="/history" className="text-primary hover:underline mt-4 inline-block">
          Back to history
        </Link>
      </div>
    );
  }

  const parsed = parseDecision(decision.result);

  return (
    <div className="space-y-12 max-w-2xl mx-auto animate-in slide-in-from-bottom-8 duration-700 pb-24">
      <Link href="/history" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to history
      </Link>

      <div className="space-y-4">
        <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">The Question</h2>
        <p className="text-xl font-serif italic text-foreground border-l-2 border-primary pl-4">{decision.question}</p>
      </div>

      {parsed.direction && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold tracking-widest uppercase text-primary">The Verdict</h2>
          <div className="text-3xl md:text-4xl font-serif text-foreground leading-tight">
            {parsed.direction}
          </div>
        </div>
      )}

      {parsed.patterns && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">Your Patterns</h2>
          <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {parsed.patterns}
          </div>
        </div>
      )}

      {parsed.tradeoffs && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">The Trade-offs</h2>
          <div className="text-foreground leading-relaxed whitespace-pre-wrap">
            {parsed.tradeoffs}
          </div>
        </div>
      )}

      {parsed.timing && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">When To Go</h2>
          <div className="text-foreground leading-relaxed whitespace-pre-wrap">
            {parsed.timing}
          </div>
        </div>
      )}

      <div className="bg-card border border-border p-6 md:p-8 space-y-6">
        <h2 className="text-sm font-bold tracking-widest uppercase text-primary flex items-center gap-2">
          <Check className="h-4 w-4" /> Action Plan
        </h2>
        
        {parsed.action.nextMove && (
          <div>
            <p className="font-serif text-xl text-foreground mb-4">{parsed.action.nextMove}</p>
          </div>
        )}
        
        {parsed.action.anchors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-muted-foreground">Anchors</h3>
            <ul className="space-y-2">
              {parsed.action.anchors.map((anchor, i) => (
                <li key={i} className="flex gap-2 text-foreground">
                  <span className="text-primary">•</span> <span>{anchor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {parsed.action.timingConfidence && (
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-1">Timing Confidence</h3>
            <p className="text-foreground">{parsed.action.timingConfidence}</p>
          </div>
        )}

        {parsed.action.stopDoingThis && (
          <div className="pt-2">
            <h3 className="text-xs font-bold uppercase text-destructive mb-1">Stop Doing This</h3>
            <p className="text-foreground">{parsed.action.stopDoingThis}</p>
          </div>
        )}
      </div>
    </div>
  );
}
