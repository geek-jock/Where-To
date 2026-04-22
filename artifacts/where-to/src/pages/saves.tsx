import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  useListSaves, 
  useCreateSave, 
  useDeleteSave, 
  useScrapeUrl,
  useGeocodeSave,
  useUpdateSave,
  useTagSave,
  getListSavesQueryKey 
} from "@workspace/api-client-react";
import type { Save } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Trash2, Link as LinkIcon, Plus, Loader2, Globe, Bookmark, MapPin, MapPinOff, List, Map, Sparkles, Maximize2, ExternalLink, Pencil, X, Check, ImagePlus, RefreshCw, Tag, Building2, UtensilsCrossed, Star, TreePine, Landmark, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { SavesMap } from "@/components/saves-map";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseDescription } from "@/lib/parse-description";

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium border border-border text-muted-foreground bg-muted/30 rounded-sm">
      {tag}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60">{label}</p>
      {children}
    </div>
  );
}

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; label: string; linkLabel: string }> = {
  hotel:        { icon: Building2,       label: "Hotel",       linkLabel: "Book on Booking.com" },
  hostel:       { icon: Building2,       label: "Hostel",      linkLabel: "Book on Booking.com" },
  resort:       { icon: Building2,       label: "Resort",      linkLabel: "Book on Booking.com" },
  accommodation:{ icon: Building2,       label: "Stay",        linkLabel: "Book on Booking.com" },
  restaurant:   { icon: UtensilsCrossed, label: "Restaurant",  linkLabel: "Find on Google Maps" },
  café:         { icon: UtensilsCrossed, label: "Café",        linkLabel: "Find on Google Maps" },
  cafe:         { icon: UtensilsCrossed, label: "Café",        linkLabel: "Find on Google Maps" },
  bar:          { icon: UtensilsCrossed, label: "Bar",         linkLabel: "Find on Google Maps" },
  food:         { icon: UtensilsCrossed, label: "Food",        linkLabel: "Find on Google Maps" },
  attraction:   { icon: Star,            label: "Attraction",  linkLabel: "Find on TripAdvisor" },
  landmark:     { icon: Star,            label: "Landmark",    linkLabel: "Find on TripAdvisor" },
  museum:       { icon: Landmark,        label: "Museum",      linkLabel: "Find on TripAdvisor" },
  gallery:      { icon: Landmark,        label: "Gallery",     linkLabel: "Find on TripAdvisor" },
  park:         { icon: TreePine,        label: "Park",        linkLabel: "View on Google Maps" },
  beach:        { icon: TreePine,        label: "Beach",       linkLabel: "View on Google Maps" },
  nature:       { icon: TreePine,        label: "Nature",      linkLabel: "View on Google Maps" },
  reserve:      { icon: TreePine,        label: "Reserve",     linkLabel: "View on Google Maps" },
  viewpoint:    { icon: Star,            label: "Viewpoint",   linkLabel: "View on Google Maps" },
  market:       { icon: ShoppingBag,     label: "Market",      linkLabel: "View on Google Maps" },
  neighborhood: { icon: MapPin,          label: "Neighborhood","linkLabel": "View on Google Maps" },
  experience:   { icon: Star,            label: "Experience",  linkLabel: "View on Google Maps" },
  activity:     { icon: Star,            label: "Activity",    linkLabel: "View on Google Maps" },
  spa:          { icon: Star,            label: "Spa",         linkLabel: "Find on Google Maps" },
};

function getCategoryConfig(category: string | null | undefined) {
  if (!category) return null;
  return CATEGORY_CONFIG[category.toLowerCase()] ?? { icon: MapPin, label: capitalize(category), linkLabel: "View on Google Maps" };
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function CategoryBadge({ category }: { category: string }) {
  const config = getCategoryConfig(category);
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase border border-primary/30 text-primary bg-primary/5 rounded-sm">
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </span>
  );
}

function SaveDetailDialog({
  save,
  open,
  onClose,
  onSaved,
}: {
  save: Save | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Save) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [imageError, setImageError] = useState(false);

  const updateSave = useUpdateSave();
  const scrapeUrl = useScrapeUrl();
  const { toast } = useToast();

  const startEdit = () => {
    if (!save) return;
    setTitle(save.scrapedTitle ?? "");
    setDescription(parseDescription(save.scrapedDescription) ?? "");
    setImageUrl(save.scrapedImage ?? "");
    setPlaceName(save.placeName ?? "");
    setTagsInput((save.tags ?? []).join(", "));
    setImageError(false);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setImageError(false); };

  const handleSave = async () => {
    if (!save) return;
    const newTags = tagsInput.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    try {
      const updated = await updateSave.mutateAsync({
        id: save.id,
        data: {
          scrapedTitle: title.trim() || null,
          scrapedDescription: description.trim() || null,
          scrapedImage: imageUrl.trim() || null,
          placeName: placeName.trim() || null,
          tags: newTags.length > 0 ? newTags : null,
        },
      });
      onSaved(updated);
      setEditing(false);
      toast({ title: "Changes saved" });
    } catch {
      toast({ title: "Failed to save changes", variant: "destructive" });
    }
  };

  const handleFetchImage = async () => {
    if (!save?.url) return;
    try {
      const result = await scrapeUrl.mutateAsync({ data: { url: save.url } });
      if (result.image) { setImageUrl(result.image); setImageError(false); toast({ title: "Image found" }); }
      else toast({ title: "No image found at this URL", variant: "destructive" });
    } catch {
      toast({ title: "Couldn't fetch image", variant: "destructive" });
    }
  };

  if (!save) return null;
  const cleanedDescription = parseDescription(save.scrapedDescription);
  const tags = save.tags ?? [];
  const isNote = !save.url;
  const hasOwnNote = save.scrapedTitle && save.content && save.content !== save.url;

  // Determine source domain for display
  let sourceDomain = "";
  try { if (save.url) sourceDomain = new URL(save.url).hostname.replace("www.", ""); } catch { /* ignore */ }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setEditing(false); } }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden gap-0 max-h-[90dvh] flex flex-col">

        {/* ── Image ── */}
        {editing ? (
          <div className="flex-shrink-0 border-b border-border bg-muted/20">
            {imageUrl && !imageError ? (
              <div className="relative h-40">
                <img src={imageUrl} alt="" className="w-full h-full object-cover" onError={() => setImageError(true)} />
                <button className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background" onClick={() => { setImageUrl(""); setImageError(false); }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-2 px-4 py-2.5">
              <ImagePlus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input placeholder="Image URL" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageError(false); }} className="flex-1 h-8 text-sm" />
              {save.url && (
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1 flex-shrink-0" onClick={handleFetchImage} disabled={scrapeUrl.isPending}>
                  {scrapeUrl.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Fetch
                </Button>
              )}
            </div>
          </div>
        ) : save.scrapedImage ? (
          <div className="h-52 w-full overflow-hidden flex-shrink-0">
            <img src={save.scrapedImage} alt="" className="w-full h-full object-cover" />
          </div>
        ) : null}

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-border">

          {/* Header: title + edit */}
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {editing ? (
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="font-serif text-base" />
                ) : (
                  <DialogHeader>
                    <DialogTitle className="font-serif text-xl leading-snug text-left">
                      {save.scrapedTitle || save.placeName || "Saved note"}
                    </DialogTitle>
                  </DialogHeader>
                )}
                {!editing && (save.placeName || save.category) && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {save.category && <CategoryBadge category={save.category} />}
                    {save.placeName && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 text-primary flex-shrink-0" />
                        <span className="font-medium text-foreground">{save.placeName}</span>
                        {save.countryCode && <span className="opacity-50">· {save.countryCode}</span>}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {!editing && (
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground mt-0.5" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Tags */}
          {(tags.length > 0 || editing) && (
            <div className="px-6 py-4">
              <Section label="Tags">
                {editing ? (
                  <div className="space-y-1.5">
                    <Input
                      value={tagsInput}
                      onChange={e => setTagsInput(e.target.value)}
                      placeholder="coastal, foodie, off-beat (comma separated)"
                      className="h-8 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">Separate with commas. Edit freely.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map(t => <TagPill key={t} tag={t} />)}
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* About (description) */}
          {(cleanedDescription || editing) && (
            <div className="px-6 py-4">
              <Section label="About">
                {editing ? (
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="text-sm min-h-[90px] resize-none" />
                ) : (
                  <p className="text-sm text-foreground/80 leading-relaxed">{cleanedDescription}</p>
                )}
              </Section>
            </div>
          )}

          {/* Your note (user-typed note separate from scraped description) */}
          {!editing && (hasOwnNote || isNote) && (
            <div className="px-6 py-4">
              <Section label={isNote ? "Note" : "Your note"}>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{save.content}</p>
              </Section>
            </div>
          )}

          {/* Location */}
          <div className="px-6 py-4">
            <Section label="Location">
              {editing ? (
                <Input value={placeName} onChange={e => setPlaceName(e.target.value)} placeholder="City, Country (will re-geocode on save)" className="h-8 text-sm" />
              ) : save.placeName ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{save.placeName}</p>
                  {save.lat != null && save.lng != null && (
                    <p className="text-xs text-muted-foreground font-mono">{save.lat.toFixed(5)}, {save.lng.toFixed(5)}</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No location detected — edit to add one</p>
              )}
            </Section>
          </div>

          {/* Source + Official Link */}
          {(save.url || save.officialLink) && (
            <div className="px-6 py-4">
              <Section label="Links">
                <div className="space-y-2">
                  {save.url && (
                    <a href={save.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground group">
                      <Globe className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="truncate">{sourceDomain || save.url}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  )}
                  {save.officialLink && (
                    <a
                      href={save.officialLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm font-medium text-primary hover:underline group"
                    >
                      {(() => {
                        const config = getCategoryConfig(save.category);
                        const Icon = config?.icon ?? Globe;
                        return <Icon className="h-3.5 w-3.5 flex-shrink-0" />;
                      })()}
                      <span>{getCategoryConfig(save.category)?.linkLabel ?? "View on Google Maps"}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  )}
                </div>
              </Section>
            </div>
          )}

          {/* Meta */}
          <div className="px-6 py-4 bg-muted/20">
            <p className="text-[10px] text-muted-foreground">
              Saved {format(new Date(save.createdAt), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        </div>

        {/* Edit action bar */}
        {editing && (
          <div className="flex-shrink-0 border-t border-border px-6 py-3 flex justify-end gap-2 bg-card">
            <Button variant="outline" size="sm" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateSave.isPending}>
              {updateSave.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Save changes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Saves() {
  const { data: saves = [], isLoading } = useListSaves();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const createSave = useCreateSave();
  const deleteSave = useDeleteSave();
  const scrapeUrl = useScrapeUrl();
  const geocodeSave = useGeocodeSave();
  const tagSave = useTagSave();

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
  const [detailSave, setDetailSave] = useState<Save | null>(null);
  const [activePinSave, setActivePinSave] = useState<Save | null>(null);

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
      Promise.all([
        geocodeSave.mutateAsync({ id: save.id }),
        tagSave.mutateAsync({ id: save.id }),
      ]).finally(() => {
        queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
      });
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
      Promise.all([
        geocodeSave.mutateAsync({ id: save.id }),
        tagSave.mutateAsync({ id: save.id }),
      ]).finally(() => {
        queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
      });
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
              onClick={() => { setViewMode("list"); setActivePinSave(null); }}
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
          /* ── Side-by-side map layout ── */
          <div className="border border-border overflow-hidden flex flex-col md:flex-row" style={{ height: "clamp(500px, 72vh, 760px)" }}>

            {/* Left: map fills all remaining space */}
            <div className="flex-1 min-h-[260px] md:min-h-0">
              <SavesMap
                saves={saves}
                selectedIds={selectedSaveIds}
                onToggle={toggleSelect}
                activeSave={activePinSave}
                onPinClick={(save) => setActivePinSave(prev => prev?.id === save.id ? null : save)}
              />
            </div>

            {/* Right: info panel */}
            <div className="w-full md:w-72 lg:w-80 flex-shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-border bg-card overflow-hidden">

              {activePinSave ? (
                /* Active pin details */
                <div className="flex flex-col h-full overflow-y-auto">
                  {activePinSave.scrapedImage && (
                    <div className="h-40 flex-shrink-0 overflow-hidden">
                      <img src={activePinSave.scrapedImage} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-5 flex flex-col gap-4 flex-1">
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          {activePinSave.category && (
                            <div className="mb-2"><CategoryBadge category={activePinSave.category} /></div>
                          )}
                          <h3 className="font-serif font-semibold text-lg leading-snug">
                            {activePinSave.scrapedTitle || activePinSave.placeName || activePinSave.content.slice(0, 60)}
                          </h3>
                        </div>
                        <button
                          onClick={() => setActivePinSave(null)}
                          className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {activePinSave.placeName && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
                          <MapPin className="h-3 w-3 text-primary flex-shrink-0" />
                          {activePinSave.placeName}
                        </p>
                      )}

                      {activePinSave.scrapedDescription && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                          {activePinSave.scrapedDescription.replace(/^(.{0,200}).*/, "$1")}
                        </p>
                      )}

                      {activePinSave.tags && activePinSave.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {activePinSave.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium tracking-wide border border-border/60 text-muted-foreground bg-muted/20 rounded-sm">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      <button
                        onClick={() => toggleSelect(activePinSave.id)}
                        className={`w-full py-2.5 px-3 text-sm font-semibold tracking-wide border transition-colors ${
                          selectedSaveIds.includes(activePinSave.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-transparent text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {selectedSaveIds.includes(activePinSave.id) ? "✓ Selected" : "Select for decision"}
                      </button>
                      <button
                        onClick={() => setDetailSave(activePinSave)}
                        className="w-full py-2 px-3 text-sm font-medium text-muted-foreground border border-border hover:text-foreground hover:bg-muted transition-colors"
                      >
                        View full details
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* No pin selected — show placeholder + save list */
                <div className="flex flex-col h-full overflow-y-auto">
                  <div className="p-4 border-b border-border">
                    <p className="text-xs text-muted-foreground">Tap a pin to see details</p>
                  </div>
                  <div className="divide-y divide-border overflow-y-auto flex-1">
                    {saves.filter(s => s.lat != null).map((save, idx) => (
                      <button
                        key={save.id}
                        className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-start gap-3"
                        onClick={() => setActivePinSave(save)}
                      >
                        <span
                          className="flex-shrink-0 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center mt-0.5"
                          style={{ background: selectedSaveIds.includes(save.id) ? "#6b7c46" : "#3d3d34" }}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {save.scrapedTitle || save.placeName || save.content.slice(0, 40)}
                          </p>
                          {save.placeName && (
                            <p className="text-xs text-muted-foreground truncate">{save.placeName}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Decide bar at bottom of panel */}
              {selectedSaveIds.length > 0 && (
                <div className="flex-shrink-0 p-3 bg-foreground border-t border-border">
                  <button
                    onClick={handleGoDecide}
                    className="flex items-center justify-center gap-2 w-full text-background text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Sparkles className="h-4 w-4" />
                    Decide with {selectedSaveIds.length}
                  </button>
                </div>
              )}
            </div>
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
                    {save.scrapedImage ? (
                      <div className="relative h-32 w-full overflow-hidden border-b border-border">
                        <img src={save.scrapedImage} alt="" className="w-full h-full object-cover" />
                        {save.category && (
                          <div className="absolute bottom-2 left-2">
                            <CategoryBadge category={save.category} />
                          </div>
                        )}
                      </div>
                    ) : save.category ? (
                      <div className="px-5 pt-4 pb-0">
                        <CategoryBadge category={save.category} />
                      </div>
                    ) : null}
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
                    {/* Tags row */}
                    {save.tags && save.tags.length > 0 && (
                      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                        {save.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium tracking-wide border border-border/60 text-muted-foreground bg-muted/20 rounded-sm"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

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
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); setDetailSave(save); }}
                          title="View full details"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); handleDelete(save.id); }}
                          data-testid={`button-delete-save-${save.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      <SaveDetailDialog
        save={detailSave}
        open={detailSave !== null}
        onClose={() => setDetailSave(null)}
        onSaved={(updated) => {
          setDetailSave(updated);
          queryClient.invalidateQueries({ queryKey: getListSavesQueryKey() });
        }}
      />
    </div>
  );
}
