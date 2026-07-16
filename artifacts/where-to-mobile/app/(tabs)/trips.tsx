import {
  useListTrips,
  useCreateTrip,
} from "@workspace/api-client-react";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import type { Trip } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const colors = useColors();

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const start = formatDate(trip.startDate ?? null);
  const end = formatDate(trip.endDate ?? null);
  const dateStr = start && end ? `${start} – ${end}` : start ?? null;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginHorizontal: 20,
      marginBottom: 12,
      padding: 18,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
    },
    name: {
      fontSize: 18,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      flex: 1,
      marginRight: 12,
    },
    chevron: {
      marginTop: 3,
    },
    destination: {
      fontSize: 13,
      color: colors.primary,
      fontFamily: "Inter_500Medium",
      marginTop: 2,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginTop: 10,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    metaText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      onPress={onPress}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={2}>{trip.name}</Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={styles.chevron} />
        </View>
        {trip.destination && (
          <Text style={styles.destination}>{trip.destination}</Text>
        )}
        <View style={styles.meta}>
          {dateStr && (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={12} color={colors.mutedForeground} />
              <Text style={styles.metaText}>{dateStr}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function CreateTripModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const createTripMutation = useCreateTrip();

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTripMutation.mutateAsync({
        data: { name: name.trim(), destination: destination.trim() || undefined },
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName("");
      setDestination("");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  };

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      padding: 24,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingBottom: Platform.OS === "web" ? 34 : 48,
    },
    title: {
      fontSize: 20,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      marginBottom: 16,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      marginBottom: 12,
    },
    btn: {
      backgroundColor: colors.primary,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
    },
    btnText: {
      color: colors.primaryForeground,
      fontSize: 16,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    cancelBtn: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    cancelText: {
      color: colors.mutedForeground,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={styles.sheet}>
            <Text style={styles.title}>New Trip</Text>
            <Text style={styles.label}>Trip Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Summer in Lisbon"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={styles.label}>Destination</Text>
            <TextInput
              style={styles.input}
              value={destination}
              onChangeText={setDestination}
              placeholder="Lisbon, Portugal"
              placeholderTextColor={colors.mutedForeground}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Pressable
              style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btn, { opacity: pressed || submitting || !name.trim() ? 0.6 : 1 }]}
              onPress={handleCreate}
              disabled={submitting || !name.trim()}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.btnText}>Create Trip</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const { signOut } = useAuth();

  const handleSignOut = () => {
    const doSignOut = () => {
      signOut().then(() => {
        router.replace("/sign-in");
      });
    };

    if (Platform.OS === "web") {
      if (window.confirm("Log out?")) {
        doSignOut();
      }
    } else {
      Alert.alert("Settings", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: doSignOut },
      ]);
    }
  };

  const { data: trips, isLoading, error, refetch } = useListTrips();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 60;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingBottom: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    addBtn: {
      width: 38,
      height: 38,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    list: { paddingTop: 16, paddingBottom: bottomPad },
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
    errorContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
    },
    errorText: {
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      marginBottom: 16,
    },
    retryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    retryText: {
      color: colors.primaryForeground,
      fontFamily: "Inter_600SemiBold",
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trips</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            onPress={handleSignOut}
            hitSlop={8}
          >
            <Feather name="settings" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowCreate(true);
            }}
            testID="create-trip-button"
          >
            <Feather name="plus" size={20} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Could not load trips</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={trips ?? []}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={[
            styles.list,
            (!trips || trips.length === 0) && { flex: 1 },
          ]}
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/trip/[id]", params: { id: String(item.id) } });
              }}
            />
          )}
          scrollEnabled={!!trips && trips.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Feather name="map" size={24} color={colors.mutedForeground} />
              </View>
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={styles.emptyText}>
                Create a trip and invite your group to start planning together.
              </Text>
            </View>
          }
        />
      )}

      <CreateTripModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </View>
  );
}
