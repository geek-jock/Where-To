import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListSaves, 
  useCreateDecision, 
  getListDecisionsQueryKey 
} from "@workspace/api-client-react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { DecisionResult } from "@/components/decision-result";
import { parseDescription } from "@/lib/parse-description";

export default function Decide() {
  const { data: saves = [], isLoading: loadingSaves } = useListSaves();
  const createDecision = useCreateDecision();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const [question, setQuestion] = useState("");
  const [selectedSaveIds, setSelectedSaveIds] = useState<number[]>([]);
  const [decision, setDecision] = useState<{ question: string; result: string; createdAt: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("saveIds");
    if (raw) {
      const ids = raw.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
      if (ids.length > 0) setSelectedSaveIds(ids);
    }
  }, [search]);

  const toggleSave = (id: number) => {
    setSelectedSaveIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDecide = async () => {
    if (!question.trim()) {
      toast({ title: "Please ask a question", variant: "destructive" });
      return;
    }
    if (selectedSaveIds.length === 0) {
      toast({ title: "Select at least one save to inform the decision", variant: "destructive" });
      return;
    }

    try {
      const res = await createDecision.mutateAsync({
        data: { question, saveIds: selectedSaveIds }
      });
      queryClient.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
      setDecision({ question: res.question, result: res.result, createdAt: res.createdAt });
    } catch {
      toast({ title: "Failed to generate decision", variant: "destructive" });
    }
  };

  if (decision) {
    return (
      <DecisionResult
        question={decision.question}
        result={decision.result}
        createdAt={decision.createdAt}
        onNewDecision={() => setDecision(null)}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-decide">Make a decision</h1>
        <p className="text-muted-foreground">Select your context, ask your question, and let us break the tie.</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-serif font-medium">1. Select your materials</h2>
        {loadingSaves ? (
          <div className="h-32 flex items-center justify-center border border-border">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : saves.length === 0 ? (
          <div className="p-6 border border-dashed border-border text-center text-muted-foreground">
            No saves yet. Go to your library to add some options first.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto p-1">
            {saves.map(save => {
              const label = save.scrapedTitle || save.placeName || save.url || "Note";
              const sub = save.placeName || parseDescription(save.scrapedDescription) || save.content;
              return (
                <label
                  key={save.id}
                  className={`flex gap-3 p-3 border cursor-pointer transition-colors ${selectedSaveIds.includes(save.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                  data-testid={`checkbox-save-${save.id}`}
                >
                  <Checkbox
                    checked={selectedSaveIds.includes(save.id)}
                    onCheckedChange={() => toggleSave(save.id)}
                    className="mt-1 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">{label}</p>
                    {sub && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{sub}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-serif font-medium">2. What's the dilemma?</h2>
        <Textarea
          placeholder="E.g. I have a week in October. Should I do Sicily or Patagonia? I'm exhausted from work and need nature but also good food."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="min-h-[120px] text-base"
          data-testid="input-question"
        />
      </div>

      <div className="pt-6 border-t border-border flex justify-end">
        <Button
          size="lg"
          className="px-8"
          onClick={handleDecide}
          disabled={createDecision.isPending || !question.trim() || selectedSaveIds.length === 0}
          data-testid="button-get-answer"
        >
          {createDecision.isPending ? (
            <><Loader2 className="h-5 w-5 animate-spin mr-2" />Thinking...</>
          ) : (
            <><Sparkles className="h-5 w-5 mr-2" />Get my answer</>
          )}
        </Button>
      </div>
    </div>
  );
}
