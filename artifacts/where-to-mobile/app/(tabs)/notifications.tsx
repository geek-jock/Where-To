import {
  useListTrips,
  useGetTripNotifications,
  useMarkTripNotificationsRead,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import type { TripNotification } from "@workspace/api-client-react";

function TripNotificationsSection({
  tripId,
  tripName,
  onPress,
}: {
  tripId: number;
  tripName: string;
  onPress: (tripId: number, decisionId: number | null) => void;
}) {
  const colors = useColors();
  const markRead = useMarkTripNotificationsRead();
  const { data: notifications, isLoading } = useGetTripNotifications(tripId);

  const unread = notifications?.filter((n) => !n.read) ?? [];

  useEffect(() => {
    if (unread.length > 0) {
      const timer = setTimeout(() => {
        markRead.mutate({ id: tripId });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [unread.length, tripId]);

  if (isLoading || unread.length === 0) return null;

  const styles = StyleSheet.create({
    section: {
      marginBottom: 4,
    },
    tripLabel: {
      fontSize: 11,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    item: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginTop: 5,
    },
    message: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      lineHeight: 20,
    },
    timeText: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
  });

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.tripLabel}>{tripName}</Text>
      {unread.map((notif) => (
        <Pressable
          key={notif.id}
          style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress(tripId, notif.decisionId ?? null);
          }}
        >
          <View style={styles.dot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.message}>{notif.message}</Text>
            <Text style={styles.timeText}>{formatTime(notif.createdAt)}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const totalUnread = useUnreadCount();

  const { data: trips, isLoading, refetch } = useListTrips();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 60;
  const hasTrips = !!trips && trips.length > 0;
  const allCaughtUp = hasTrips && totalUnread === 0;

  const handleNotifPress = (tripId: number, decisionId: number | null) => {
    if (decisionId) {
      router.push({
        pathname: "/decision",
        params: { tripId: String(tripId), decId: String(decisionId) },
      });
    } else {
      router.push({ pathname: "/trip/[id]", params: { id: String(tripId) } });
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingBottom: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 6,
      textAlign: "center",
    },
    emptyText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      lineHeight: 20,
    },
    scrollContent: {
      paddingBottom: bottomPad,
    },
  });

  const sortedTrips = [...(trips ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : allCaughtUp ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Feather name="bell" size={24} color={colors.mutedForeground} />
          </View>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyText}>
            Nudges and booking reminders from your trips will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedTrips}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <TripNotificationsSection
              tripId={item.id}
              tripName={item.name}
              onPress={handleNotifPress}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Feather name="bell" size={24} color={colors.mutedForeground} />
              </View>
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptyText}>
                Nudges and booking reminders from your trips will appear here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
