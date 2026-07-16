import React, { useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTrips,
  useCreateTrip,
  getListTripsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Plus, Loader2, MapPin, Calendar, Users, Crown, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  if (!startDate && !endDate) return null;
  const fmt = (d: string) => {
    try { return format(new Date(d + "T00:00:00"), "MMM d, yyyy"); } catch { return d; }
  };
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `From ${fmt(startDate)}`;
  if (endDate) return `Until ${fmt(endDate)}`;
  return null;
}

function CreateTripDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useUser();
  const createTrip = useCreateTrip();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createTrip.mutateAsync({
        data: {
          name: name.trim(),
          destination: destination.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          displayName: user?.fullName ?? user?.firstName ?? null,
          avatarUrl: user?.imageUrl ?? null,
        },
      });
      toast({ title: "Trip created" });
      setName("");
      setDestination("");
      setStartDate("");
      setEndDate("");
      onCreated();
      onClose();
    } catch {
      toast({ title: "Failed to create trip", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New trip</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
              Trip name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="e.g. Portugal Summer 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              data-testid="input-trip-name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
              Destination
            </label>
            <Input
              placeholder="e.g. Lisbon, Porto, Algarve"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              data-testid="input-trip-destination"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
                Start date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground/60">
                End date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || createTrip.isPending} data-testid="button-create-trip">
              {createTrip.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create trip
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Trips() {
  const { data: trips = [], isLoading } = useListTrips();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
  };

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Trips</h1>
          <p className="text-muted-foreground">Plan group travel with friends.</p>
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground mb-2" data-testid="title-trips">Trips</h1>
          <p className="text-muted-foreground">Plan group travel with friends.</p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-new-trip">
          <Plus className="h-4 w-4 mr-2" />
          New trip
        </Button>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Compass className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium mb-1">No trips yet</p>
          <p className="text-sm text-muted-foreground/60 mb-6">Create a trip and invite your group.</p>
          <Button onClick={() => setCreating(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create your first trip
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {trips.map((trip) => {
            const isCoordinator = trip.coordinatorId === user?.id;
            const dateRange = formatDateRange(trip.startDate, trip.endDate);
            return (
              <Link key={trip.id} href={`/trips/${trip.id}`}>
                <Card className="border-border shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-serif font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
                            {trip.name}
                          </h2>
                          {isCoordinator && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase border border-amber-300 text-amber-700 bg-amber-50 rounded-sm">
                              <Crown className="h-2.5 w-2.5" />
                              Coordinator
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap">
                          {trip.destination && (
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                              {trip.destination}
                            </span>
                          )}
                          {dateRange && (
                            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                              {dateRange}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
                        <Users className="h-3.5 w-3.5" />
                        <span>Group</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <CreateTripDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
