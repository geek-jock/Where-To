import {
  useListTrips,
  getTripNotifications,
  getGetTripNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueries } from "@tanstack/react-query";

export function useUnreadCount(): number {
  const { data: trips } = useListTrips();
  const tripIds = trips?.map((t) => t.id) ?? [];

  const results = useQueries({
    queries: tripIds.map((id) => ({
      queryKey: getGetTripNotificationsQueryKey(id),
      queryFn: () => getTripNotifications(id),
      enabled: tripIds.length > 0,
      staleTime: 30_000,
    })),
  });

  let count = 0;
  for (const result of results) {
    if (result.data) {
      count += result.data.filter((n) => !n.read).length;
    }
  }
  return count;
}
