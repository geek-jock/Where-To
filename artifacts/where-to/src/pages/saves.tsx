import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  useListSaves, 
  useCreateSave, 
  useDeleteSave, 
  useScrapeUrl,
  useGeocodeSave,
  getListSavesQueryKey 
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, Link as LinkIcon, Plus, Loader2, Globe, Bookmark, MapPin, MapPinOff, List, Map, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { SavesMap } from "@/components/saves-map";

export default function Saves() {
  const { data: saves = [], isLoading } = useListSaves();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const createSave = useCreateSave();
  const deleteSave = useDeleteSave();
  const scrapeUrl = useScrapeUrl();
  const geocodeSave = useGeocodeSave();

  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [scrapedData, setScrapedData] = useState<{
    url: string;
    title?: string | null;
    description?: string | null;
    image?: string | null;
  } | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedSaveIds, setSelectedSaveIds] = useState<number[]>([]);

  const toggleSelect = (id: number) => {
    setSelectedSaveIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleGoDecide = () => {
    setLocation(`/decide?saveIds=${selectedSaveIds.join(",")}`);
  };

  const handleScrape = async () => {
    if (!urlInput.trim()) return;
    try {
      const result = await scrapeUrl.mutateAsync({ data: { url: urlInput } });
      setScrapedData(result);
    } catch {
      toast({
        title: "Couldn't fetch preview",
        description: "We'll save the link anyway.",
        variant: "destructive",
      });
      setScrapedData({ url: urlInput });
    }
  };

  const handleSaveUrl = async () => {
    if (!scrapedData) return;
    try {
      const save = await createSave.mutateAsync({
        data: {
          content: scrapedData.url,
          url: scrapedData.url,
          scrapedTitle: scrapedData.title,
          scrapedDescription: scrapedData.description,
          scrapedImage: scrapedData.image,
        }
      });
      queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
      setScrapedData(null);
      setUrlInput("");
      toast({ title: "Saved successfully" });
      geocodeSave.mutateAsync({ id: save.id }).then(() => {
        queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
      }).catch(() => {});
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleSaveText = async () => {
    if (!textInput.trim()) return;
    try {
      const save = await createSave.mutateAsync({
        data: { content: textInput }
      });
      queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
      setTextInput("");
      toast({ title: "Saved successfully" });
      geocodeSave.mutateAsync({ id: save.id }).then(() => {
        queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
      }).catch(() => {});
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSave.mutateAsync({ id });
      setSelectedSaveIds(prev => prev.filter(x => x !== id));
      queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-saves">Gather your ideas</h1>
        <p className="text-muted-foreground">Save articles, hotel links, or random thoughts for your next trip.</p>
      </div>

      <Card className="border-border shadow-sm">
        <Tabs defaultValue="url" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger
              value="url"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
              data-testid="tab-url"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Save a Link
            </TabsTrigger>
            <TabsTrigger
              value="text"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
              data-testid="tab-text"
            >
              <Plus className="h-4 w-4 mr-2" />
              Write a Note
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="p-6 m-0 outline-none">
            {!scrapedData ? (
              <div className="flex gap-4">
                <Input
                  placeholder="https://..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                  className="flex-1"
                  data-testid="input-url"
                />
                <Button
                  onClick={handleScrape}
                  disabled={!urlInput.trim() || scrapeUrl.isPending}
                  data-testid="button-preview-url"
                >
                  {scrapeUrl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in">
                <div className="border border-border p-4 flex gap-4 bg-muted/30">
                  {scrapedData.image && (
                    <img src={scrapedData.image} alt="" className="w-24 h-24 object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-medium text-lg truncate">{scrapedData.title || scrapedData.url}</h3>
                    {scrapedData.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{scrapedData.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2 truncate flex items-center gap-1">
                      <Globe className="h-3 w-3" /> {scrapedData.url}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setScrapedData(null)} data-testid="button-cancel-save">Cancel</Button>
                  <Button onClick={handleSaveUrl} disabled={createSave.isPending} data-testid="button-confirm-save">
                    {createSave.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Save this"}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="text" className="p-6 m-0 outline-none space-y-4">
            <Textarea
              placeholder="E.g. A friend told me to check out the Amalfi coast next May..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-text"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSaveText}
                disabled={!textInput.trim() || createSave.isPending}
                data-testid="button-save-text"
              >
                {createSave.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Save note"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-serif font-semibold">Your library</h2>
          <div className="flex items-center border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm min-h-[40px] transition-colors ${
                viewMode === "list"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm min-h-[40px] border-l border-border transition-colors ${
                viewMode === "map"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              aria-label="Map view"
            >
              <Map className="h-4 w-4" />
              <span className="hidden sm:inline">Map</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : saves.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border text-muted-foreground">
            <Bookmark className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p>Your library is empty. Save some links or ideas to get started.</p>
          </div>
        ) : viewMode === "map" ? (
          <div className="relative">
            <SavesMap
              saves={saves}
              selectedIds={selectedSaveIds}
              onToggle={toggleSelect}
            />
            {selectedSaveIds.length > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] animate-in slide-in-from-bottom-4 duration-300">
                <button
                  onClick={handleGoDecide}
                  className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background text-sm font-medium shadow-lg hover:opacity-90 transition-opacity"
                >
                  <Sparkles className="h-4 w-4" />
                  Decide with {selectedSaveIds.length} {selectedSaveIds.length === 1 ? "place" : "places"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {saves.map((save, idx) => {
                const isSelected = selectedSaveIds.includes(save.id);
                const hasLocation = save.lat != null && save.lng != null;
                const num = saves.filter(s => s.lat != null).indexOf(save) + 1;

                return (
                  <Card
                    key={save.id}
                    className={`overflow-hidden flex flex-col group shadow-none cursor-pointer transition-all ${
                      isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                    }`}
                    onClick={() => toggleSelect(save.id)}
                    data-testid={`card-save-${save.id}`}
                  >
                    {save.scrapedImage && (
                      <div className="h-32 w-full overflow-hidden border-b border-border">
                        <img src={save.scrapedImage} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardContent className="p-5 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {save.scrapedTitle ? (
                            <>
                              <h3 className="font-serif font-semibold text-lg line-clamp-2 mb-2">
                                <a
                                  href={save.url!}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {save.scrapedTitle}
                                </a>
                              </h3>
                              {save.scrapedDescription && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{save.scrapedDescription}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-foreground whitespace-pre-wrap text-sm">{save.content}</p>
                          )}
                          {save.url && !save.scrapedTitle && (
                            <a
                              href={save.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-1 mt-2 truncate"
                              onClick={e => e.stopPropagation()}
                            >
                              <LinkIcon className="h-3 w-3 flex-shrink-0" /> {save.url}
                            </a>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 pl-2">
                          {hasLocation ? (
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                              style={{ background: isSelected ? "#6b7c46" : "#3d3d34" }}
                              title={save.placeName ?? undefined}
                            >
                              {saves.filter(s => s.lat != null).indexOf(save) + 1}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground"
                              title="No location detected for this save"
                            >
                              <MapPinOff className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="p-4 pt-0 flex justify-between items-center bg-card mt-auto text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {save.placeName && (
                          <>
                            <MapPin className="h-3 w-3 text-primary" />
                            <span className="text-primary font-medium">{save.placeName}</span>
                            <span className="mx-1 opacity-30">·</span>
                          </>
                        )}
                        {format(new Date(save.createdAt), "MMM d, yyyy")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleDelete(save.id); }}
                        data-testid={`button-delete-save-${save.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>

            {selectedSaveIds.length > 0 && (
              <div
                className="fixed left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300"
                style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4rem)" }}
              >
                <button
                  onClick={handleGoDecide}
                  className="flex items-center gap-2 px-6 py-3 bg-foreground text-background text-sm font-medium shadow-xl hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  <Sparkles className="h-4 w-4" />
                  Decide with {selectedSaveIds.length} {selectedSaveIds.length === 1 ? "place" : "places"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
