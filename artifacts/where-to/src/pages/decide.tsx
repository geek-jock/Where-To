import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSaves,
  useCreateDecision,
  getListDecisionsQueryKey,
} from "@workspace/api-client-react";
import type { VerdictJson } from "@workspace/api-client-react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { DecisionResult } from "@/components/decision-result";
import { useLocation } from "wouter";

type Phase = "ask" | "result";

export default function Decide() {
  const { data: saves = [], isLoading: loadingSaves } = useListSaves();
  const createDecision = useCreateDecision();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [decision, setDecision] = useState<{ question: string; result: string; resultJson?: VerdictJson | null; createdAt: string } | null>(null);

  const savesMap: Record<number, string> = Object.fromEntries(
    saves.map(s => [s.id, s.scrapedTitle || s.placeName || s.note?.slice(0, 40) || `Save #${s.id}`])
  );

  const handleGetVerdict = async () => {
    if (!question.trim()) {
      toast({ title: "Please type a question first", variant: "destructive" });
      return;
    }

    try {
      const res = await createDecision.mutateAsync({ data: { question } });
      queryClient.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
      setDecision({ question: res.question, result: res.result, resultJson: res.resultJson, createdAt: res.createdAt });
      setPhase("result");
    } catch {
      toast({ title: "Failed to generate verdict", variant: "destructive" });
    }
  };

  const handleNewDecision = () => {
    setQuestion("");
    setPhase("ask");
    setDecision(null);
  };

  if (phase === "result" && decision) {
    return (
      <DecisionResult
        question={decision.question}
        result={decision.result}
        resultJson={decision.resultJson}
        createdAt={decision.createdAt}
        onNewDecision={handleNewDecision}
        savesMap={savesMap}
      />
    );
  }

  if (loadingSaves) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-2xl mx-auto animate-in fade-in duration-500">

      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-decide">
          Where to?
        </h1>
        <p className="text-muted-foreground">
          Ask your question — we'll pull the right saves and give you a verdict.
        </p>
      </div>

      <div className="space-y-4">
        <Textarea
          placeholder="e.g. I really want to do a safari but doing one in Australia kinda doesn't hit the right vibe"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="min-h-[160px] text-base resize-none"
          data-testid="input-question"
          disabled={createDecision.isPending}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleGetVerdict();
            }
          }}
        />

        {saves.length === 0 ? (
          <div className="p-5 border border-dashed border-border text-center space-y-2">
            <p className="text-muted-foreground text-sm">You don't have any saves yet.</p>
            <p className="text-muted-foreground text-sm">
              Go to{" "}
              <button
                className="text-primary hover:underline font-medium"
                onClick={() => setLocation("/saves")}
              >
                Library
              </button>{" "}
              to save some links or notes first, then come back to decide.
            </p>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              size="lg"
              className="px-8"
              onClick={handleGetVerdict}
              disabled={createDecision.isPending || !question.trim()}
              data-testid="button-get-verdict"
            >
              {createDecision.isPending ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" />Deciding...</>
              ) : (
                <><Sparkles className="h-5 w-5 mr-2" />Get my verdict</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
