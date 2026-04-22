import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListSaves, 
  useCreateDecision, 
  getListDecisionsQueryKey 
} from "@workspace/api-client-react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { parseDecision } from "@/lib/decision-parser";

export default function Decide() {
  const { data: saves = [], isLoading: loadingSaves } = useListSaves();
  const createDecision = useCreateDecision();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const [question, setQuestion] = useState("");
  const [selectedSaveIds, setSelectedSaveIds] = useState<number[]>([]);
  const [result, setResult] = useState<string | null>(null);

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
        data: {
          question,
          saveIds: selectedSaveIds,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
      setResult(res.result);
    } catch (error) {
      toast({ title: "Failed to generate decision", variant: "destructive" });
    }
  };

  if (result) {
    const parsed = parseDecision(result);
    return (
      <div className="space-y-12 max-w-2xl mx-auto animate-in slide-in-from-bottom-8 duration-700 pb-24">
        <div className="space-y-4">
          <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">The Question</h2>
          <p className="text-xl font-serif italic text-foreground border-l-2 border-primary pl-4">{question}</p>
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

        {parsed.action.hook && (
          <div className="text-center pt-8">
            <p className="text-muted-foreground italic mb-6">{parsed.action.hook}</p>
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={() => setLocation('/history')} data-testid="button-view-history">
                Save to history
              </Button>
              <Button onClick={() => setResult(null)} data-testid="button-new-decision">
                Ask something else
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-decide">Make a decision</h1>
        <p className="text-muted-foreground">Select the context, ask your question, and let us break the tie.</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto p-1">
            {saves.map(save => (
              <label 
                key={save.id} 
                className={`flex gap-3 p-3 border cursor-pointer transition-colors ${selectedSaveIds.includes(save.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                data-testid={`checkbox-save-${save.id}`}
              >
                <Checkbox 
                  checked={selectedSaveIds.includes(save.id)} 
                  onCheckedChange={() => toggleSave(save.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground line-clamp-1">
                    {save.scrapedTitle || save.url || "Note"}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {save.scrapedDescription || save.content}
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-serif font-medium">2. What's the dilemma?</h2>
        <Textarea 
          placeholder="E.g. I have a week in October. Should I do the food tour in Sicily or hike in Patagonia? I'm exhausted from work."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="min-h-[120px] text-lg"
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
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Thinking...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              Get my answer
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
