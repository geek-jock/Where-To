import { useGetDecision } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";
import { DecisionResult } from "@/components/decision-result";

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
      <div className="text-center py-16 space-y-4">
        <p className="text-muted-foreground text-lg">Decision not found.</p>
        <Link href="/history" className="text-primary hover:underline text-sm">
          Back to history
        </Link>
      </div>
    );
  }

  return (
    <DecisionResult
      question={decision.question}
      result={decision.result}
      resultJson={decision.resultJson}
      createdAt={decision.createdAt}
      backHref="/history"
    />
  );
}
