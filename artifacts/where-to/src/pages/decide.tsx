import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSaves,
  useCreateDecision,
  useSelectSavesForDecision,
  getListDecisionsQueryKey,
} from "@workspace/api-client-react";
import type { Save, VerdictJson } from "@workspace/api-client-react";
import { Loader2, Sparkles, X, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DecisionResult } from "@/components/decision-result";
import { useLocation } from "wouter";

type Phase = "ask" | "review" | "result";

function SaveChip({ save, onRemove }: { save: Save; onRemove: () => void }) {
  const label = save.scrapedTitle || save.placeName || save.content?.slice(0, 30) || "Save";
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-primary/10 border border-primary/20 text-sm text-foreground font-medium">
      <span className="max-w-[160px] truncate">{label}</span>
      <button
        onClick={onRemove}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export default function Decide() {
  const { data: saves = [], isLoading: loadingSaves } = useListSaves();
  const selectSaves = useSelectSavesForDecision();
  const createDecision = useCreateDecision();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>("ask");
  const [question, setQuestion] = useState("");
  const [selectedSaveIds, setSelectedSaveIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [decision, setDecision] = useState<{ question: string; result: string; resultJson?: VerdictJson | null; createdAt: string } | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const selectedSaves = saves.filter(s => selectedSaveIds.includes(s.id));

  const searchResults = searchQuery.trim()
    ? saves.filter(s => {
        const q = searchQuery.toLowerCase();
        const label = (s.scrapedTitle || s.placeName || s.content || "").toLowerCase();
        const tags = (s.tags ?? []).join(" ").toLowerCase();
        const place = (s.placeName || "").toLowerCase();
        return (label.includes(q) || tags.includes(q) || place.includes(q))
          && !selectedSaveIds.includes(s.id);
      }).slice(0, 6)
    : [];

  const removeChip = (id: number) => {
    setSelectedSaveIds(prev => prev.filter(x => x !== id));
  };

  const addChip = (save: Save) => {
    setSelectedSaveIds(prev => prev.includes(save.id) ? prev : [...prev, save.id]);
    setSearchQuery("");
    setShowSearchResults(false);
  };

  const handleGetAnswer = async () => {
    if (!question.trim()) {
      toast({ title: "Please type a question first", variant: "destructive" });
      return;
    }

    if (saves.length === 0) return;

    try {
      const res = await selectSaves.mutateAsync({ data: { question } });
      setSelectedSaveIds(res.saveIds);
      setPhase("review");
    } catch {
      toast({ title: "Couldn't select saves automatically", description: "You can add saves manually below.", variant: "destructive" });
      setPhase("review");
    }
  };

  const handleConfirmDecision = async () => {
    if (!question.trim()) {
      toast({ title: "Please type a question first", variant: "destructive" });
      return;
    }
    if (selectedSaveIds.length === 0) {
      toast({ title: "Add at least one save to inform the decision", variant: "destructive" });
      return;
    }

    try {
      const res = await createDecision.mutateAsync({
        data: { question, saveIds: selectedSaveIds }
      });
      queryClient.invalidateQueries({ queryKey: getListDecisionsQueryKey() });
      setDecision({ question: res.question, result: res.result, resultJson: res.resultJson, createdAt: res.createdAt });
      setPhase("result");
    } catch {
      toast({ title: "Failed to generate decision", variant: "destructive" });
    }
  };

  const handleNewDecision = () => {
    setQuestion("");
    setSelectedSaveIds([]);
    setSearchQuery("");
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

      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-decide">
          Where to?
        </h1>
        <p className="text-muted-foreground">
          Ask your question — we'll pull the right saves and help you decide.
        </p>
      </div>

      {/* Question */}
      <div className="space-y-4">
        <Textarea
          placeholder="E.g. I have a week in October. Should I do Sicily or Patagonia? I'm exhausted from work and need nature but also good food."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="min-h-[140px] text-base resize-none"
          data-testid="input-question"
          disabled={createDecision.isPending}
        />

        {/* Get my answer button — shown in "ask" phase */}
        {phase === "ask" && (
          saves.length === 0 ? (
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
                onClick={handleGetAnswer}
                disabled={selectSaves.isPending || !question.trim()}
                data-testid="button-get-answer"
              >
                {selectSaves.isPending ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" />Thinking...</>
                ) : (
                  <><Sparkles className="h-5 w-5 mr-2" />Get my answer</>
                )}
              </Button>
            </div>
          )
        )}
      </div>

      {/* Chips + search — shown in "review" phase */}
      {phase === "review" && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
              Context — {selectedSaves.length === 0 ? "none selected" : `${selectedSaves.length} save${selectedSaves.length !== 1 ? "s" : ""}`}
            </p>

            {/* Chips row */}
            <div className="flex flex-wrap gap-2 min-h-[36px]">
              {selectedSaves.map(save => (
                <SaveChip
                  key={save.id}
                  save={save}
                  onRemove={() => removeChip(save.id)}
                />
              ))}
              {selectedSaves.length === 0 && (
                <span className="text-sm text-muted-foreground italic">No saves selected — search below to add some</span>
              )}
            </div>

            {/* Search to add more */}
            <div className="relative" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search saves by name, place, or tag…"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 150)}
                  className="pl-9"
                  data-testid="input-save-search"
                />
              </div>

              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-card border border-border shadow-md divide-y divide-border">
                  {searchResults.map(save => {
                    const label = save.scrapedTitle || save.placeName || save.content?.slice(0, 60) || "Save";
                    const sub = save.placeName || (save.tags ?? []).slice(0, 3).join(", ");
                    return (
                      <button
                        key={save.id}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-3"
                        onMouseDown={() => addChip(save)}
                      >
                        <Plus className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{label}</p>
                          {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              onClick={() => setPhase("ask")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Edit question
            </button>
            <Button
              size="lg"
              className="px-8"
              onClick={handleConfirmDecision}
              disabled={createDecision.isPending || selectedSaveIds.length === 0}
              data-testid="button-confirm-decision"
            >
              {createDecision.isPending ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" />Deciding...</>
              ) : (
                <><Sparkles className="h-5 w-5 mr-2" />Confirm decision</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
