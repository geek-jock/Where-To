import { useListDecisions, useDeleteDecision, getListDecisionsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { FileText, ArrowRight, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function extractVerdict(result: string): string {
  const lines = result.split("\n");
  let nextIsVerdict = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (nextIsVerdict) return line;
    if (
      line.includes("Your Best Trip Direction") ||
      line.includes("Best Trip Direction") ||
      line.includes("The Verdict")
    ) {
      nextIsVerdict = true;
    }
  }
  const first = lines.find(l => l.trim() && !l.trim().endsWith(":") && !l.trim().startsWith("-"));
  return first?.trim() ?? "View decision";
}

function extractSummary(result: string): string {
  const lines = result.split("\n");
  const bullets = lines.filter(l => l.trim().startsWith("-")).slice(0, 2);
  if (bullets.length > 0) return bullets.map(b => b.replace(/^-\s*/, "").trim()).join(" · ");
  const first = lines.find(l => l.trim() && !l.trim().endsWith(":") && !l.trim().startsWith("-"));
  return first?.trim() ?? "";
}

export default function History() {
  const { data: decisions = [], isLoading } = useListDecisions();
  const deleteDecision = useDeleteDecision();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteDecision.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
    toast({ title: "Decision deleted" });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-history">Decision History</h1>
        <p className="text-muted-foreground">Your past verdicts and recommendations.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-20" />
          <p>No decisions yet. Ask a question to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map(decision => {
            const verdict = extractVerdict(decision.result);
            const summary = extractSummary(decision.result);
            return (
              <Link
                key={decision.id}
                href={`/history/${decision.id}`}
                className="block group"
                data-testid={`link-decision-${decision.id}`}
              >
                <div className="p-5 border border-border bg-card hover:border-primary/40 transition-colors flex gap-4 items-center">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                      {format(new Date(decision.createdAt), "MMM d, yyyy")}
                    </p>
                    <p className="text-muted-foreground text-sm line-clamp-1 italic">
                      "{decision.question}"
                    </p>
                    <p className="font-serif text-lg font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                      {verdict}
                    </p>
                    {summary && summary !== verdict && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{summary}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      onClick={e => handleDelete(e, decision.id)}
                      aria-label="Delete decision"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
