import { useListDecisions } from "@workspace/api-client-react";
import { format } from "date-fns";
import { FileText, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function History() {
  const { data: decisions = [], isLoading } = useListDecisions();

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-history">Decision History</h1>
        <p className="text-muted-foreground">Past verdicts and recommendations.</p>
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
        <div className="space-y-4">
          {decisions.map(decision => {
            // Extract the first bit of text to show as preview
            const preview = decision.result.split('\n').find(line => line.trim() && !line.startsWith('#')) || "View decision...";
            
            return (
              <Link 
                key={decision.id} 
                href={`/history/${decision.id}`}
                className="block group"
                data-testid={`link-decision-${decision.id}`}
              >
                <div className="p-5 border border-border bg-card hover:border-primary/50 transition-colors flex gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-lg font-medium mb-1 truncate text-foreground group-hover:text-primary transition-colors">
                      {decision.question}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
                      {preview}
                    </p>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {format(new Date(decision.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center text-muted-foreground group-hover:text-primary transition-colors">
                    <ArrowRight className="h-5 w-5" />
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
