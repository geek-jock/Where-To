import {
  useGetTrip,
  useListGroupDecisions,
  useJoinTrip,
} from "@workspace/api-client-react";
import { useAuth } from "@clerk/clerk-expo";
import { useLocalSearchParams, useRouter, Stack, Redirect } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  undecided: { label: "Open", color: "#e6a800" },
  assigned: { label: "Assigned", color: "#2196F3" },
  done: { label: "Booked", color: "#4CAF50" },
};

export default function InviteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { tripId, token } = useLocalSearchParams<{ tripId: string; token: string }>();
  const { isSignedIn, isLoaded } = useAuth();

  const tripIdNum = parseInt(tripId ?? "0");
  const inviteToken = token ?? "";

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = useGetTrip(tripIdNum, { invite: inviteToken });

  const { data: decisions } = useListGroupDecisions(tripIdNum, { invite: inviteToken });

  const joinMutation = useJoinTrip();

  if (joined) {
    return <Redirect href={{ pathname: "/trip/[id]", params: { id: String(tripIdNum) } }} />;
  }

  const isMember = isSignedIn && trip?.currentUserRole != null;

  const handleJoinOrSignIn = async () => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }

    if (isMember) {
      router.replace({ pathname: "/trip/[id]", params: { id: String(tripIdNum) } });
      return;
    }

    setJoining(true);
    setJoinError(null);
    try {
      await joinMutation.mutateAsync({ id: tripIdNum, data: { inviteToken } });
      await qc.invalidateQueries({ queryKey: ["/api/trips"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setJoined(true);
    } catch (e: any) {
      setJoinError(e?.message ?? "Failed to join trip");
    } finally {
      setJoining(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  const formatDate = (d: string | null | undefined) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const start = formatDate(trip?.startDate);
  const end = formatDate(trip?.endDate);
  const dateStr = start && end ? `${start} – ${end}` : start ?? null;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingBottom: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    badge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    tripName: {
      fontSize: 26,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: -0.5,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 14,
      marginTop: 8,
    },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    metaText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    section: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    memberRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    memberChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.muted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 2,
    },
    memberChipText: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    decisionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    decisionQuestion: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    statusBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 2,
    },
    statusText: {
      fontSize: 10,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.4,
    },
    ctaBox: {
      margin: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 12,
    },
    ctaTitle: {
      fontSize: 16,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    ctaSubtitle: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 19,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    secondaryBtn: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: {
      color: colors.foreground,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
    readOnlyBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.muted,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    readOnlyText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    errorContainerText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
  });

  const renderCTA = () => {
    if (!isLoaded) return null;

    if (!isSignedIn) {
      return (
        <View style={s.ctaBox}>
          <Text style={s.ctaTitle}>You're invited!</Text>
          <Text style={s.ctaSubtitle}>
            Sign in to your Where To account to join this trip and collaborate on decisions.
          </Text>
          {joinError && <Text style={s.errorText}>{joinError}</Text>}
          <Pressable
            style={({ pressed }) => [s.primaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/sign-in")}
            testID="invite-sign-in-button"
          >
            <Text style={s.primaryBtnText}>Sign In to Join</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.secondaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.push("/sign-in")}
          >
            <Text style={s.secondaryBtnText}>Create Account</Text>
          </Pressable>
        </View>
      );
    }

    if (isMember) {
      return (
        <View style={s.ctaBox}>
          <Text style={s.ctaTitle}>You're already a member</Text>
          <Text style={s.ctaSubtitle}>
            You're already part of this trip. Open it to see the latest decisions.
          </Text>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => router.replace({ pathname: "/trip/[id]", params: { id: String(tripIdNum) } })}
            testID="invite-open-trip-button"
          >
            <Text style={s.primaryBtnText}>Open Trip</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={s.ctaBox}>
        <Text style={s.ctaTitle}>Join this trip</Text>
        <Text style={s.ctaSubtitle}>
          You've been invited to collaborate. Join to comment on decisions and vote.
        </Text>
        {joinError && <Text style={s.errorText}>{joinError}</Text>}
        <Pressable
          style={({ pressed }) => [s.primaryBtn, { opacity: pressed || joining ? 0.7 : 1 }]}
          onPress={handleJoinOrSignIn}
          disabled={joining}
          testID="invite-join-button"
        >
          {joining ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s.primaryBtnText}>Join Trip</Text>
          )}
        </Pressable>
      </View>
    );
  };

  if (!tripIdNum || !inviteToken) {
    return (
      <View style={[s.container, s.errorContainer]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="link" size={32} color={colors.mutedForeground} />
        <Text style={[s.errorContainerText, { marginTop: 12 }]}>
          This invite link is invalid or has expired.
        </Text>
      </View>
    );
  }

  if (tripLoading) {
    return (
      <View style={[s.container, s.loadingContainer]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (tripError || !trip) {
    return (
      <View style={[s.container, s.errorContainer]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[s.errorContainerText, { marginTop: 12 }]}>
          This invite link is invalid or has expired.
        </Text>
        {!isSignedIn && (
          <Pressable
            style={[s.primaryBtn, { marginTop: 20, paddingHorizontal: 24 }]}
            onPress={() => router.push("/sign-in")}
          >
            <Text style={s.primaryBtnText}>Sign In</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView>
        <View style={s.header}>
          <View style={s.badge}>
            <Feather name="map-pin" size={20} color={colors.primaryForeground} />
          </View>
          <Text style={s.eyebrow}>Trip Invitation</Text>
          <Text style={s.tripName}>{trip.name}</Text>
          <View style={s.metaRow}>
            {trip.destination && (
              <View style={s.metaItem}>
                <Feather name="map" size={13} color={colors.mutedForeground} />
                <Text style={s.metaText}>{trip.destination}</Text>
              </View>
            )}
            {dateStr && (
              <View style={s.metaItem}>
                <Feather name="calendar" size={13} color={colors.mutedForeground} />
                <Text style={s.metaText}>{dateStr}</Text>
              </View>
            )}
            {trip.members && (
              <View style={s.metaItem}>
                <Feather name="users" size={13} color={colors.mutedForeground} />
                <Text style={s.metaText}>{trip.members.length} members</Text>
              </View>
            )}
          </View>
        </View>

        {!isMember && (
          <View style={s.readOnlyBanner}>
            <Feather name="eye" size={13} color={colors.mutedForeground} />
            <Text style={s.readOnlyText}>Preview — join to participate in decisions</Text>
          </View>
        )}

        {trip.members && trip.members.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Members · {trip.members.length}</Text>
            <View style={s.memberRow}>
              {trip.members.map((m) => {
                const name = m.displayName ?? "Member";
                const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <View key={m.userId} style={s.memberChip}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary + "40", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 9, fontWeight: "700" as const, color: colors.primary, fontFamily: "Inter_700Bold" }}>{initials}</Text>
                    </View>
                    <Text style={s.memberChipText}>{name.split(" ")[0]}</Text>
                    {m.role === "coordinator" && (
                      <Text style={{ fontSize: 10, color: colors.primary, fontFamily: "Inter_500Medium" }}>★</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {decisions && decisions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Decisions · {decisions.length}</Text>
            {decisions.map((d) => {
              const cfg = STATUS_CONFIG[d.status] ?? { label: d.status, color: "#888" };
              return (
                <View key={d.id} style={s.decisionRow}>
                  <Text style={s.decisionQuestion} numberOfLines={2}>{d.question}</Text>
                  <View style={[s.statusBadge, { backgroundColor: cfg.color + "20", borderWidth: 1, borderColor: cfg.color + "50" }]}>
                    <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {renderCTA()}

        <View style={{ height: bottomPad }} />
      </ScrollView>
    </View>
  );
}
