import {
  useGetTrip,
  useListGroupDecisions,
  useCreateGroupDecision,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import type { GroupDecision, TripMember } from "@workspace/api-client-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  undecided: { label: "Open", color: "#e6a800" },
  assigned: { label: "Assigned", color: "#2196F3" },
  done: { label: "Booked", color: "#4CAF50" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: "#888" };
  return (
    <View
      style={{
        backgroundColor: config.color + "20",
        borderWidth: 1,
        borderColor: config.color + "50",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 3,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600" as const,
          color: config.color,
          fontFamily: "Inter_600SemiBold",
          letterSpacing: 0.4,
        }}
      >
        {config.label.toUpperCase()}
      </Text>
    </View>
  );
}

function MemberAvatar({ member }: { member: TripMember }) {
  const colors = useColors();
  const initials = (member.displayName ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primary + "30",
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600" as const,
          color: colors.primary,
          fontFamily: "Inter_600SemiBold",
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

function DecisionItem({
  decision,
  onPress,
}: {
  decision: GroupDecision;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.card,
        gap: 12,
      })}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "600" as const,
            color: colors.foreground,
            fontFamily: "Inter_600SemiBold",
            marginBottom: 4,
          }}
          numberOfLines={2}
        >
          {decision.question}
        </Text>
        {decision.costPerPax && (
          <Text
            style={{
              fontSize: 12,
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
            }}
          >
            ~${decision.costPerPax}/person
          </Text>
        )}
      </View>
      <StatusBadge status={decision.status} />
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

function AddDecisionModal({
  visible,
  tripId,
  onClose,
}: {
  visible: boolean;
  tripId: number;
  onClose: () => void;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const createDecision = useCreateGroupDecision();
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!question.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createDecision.mutateAsync({ id: tripId, data: { question: question.trim() } });
      await qc.invalidateQueries({ queryKey: [`/api/trips/${tripId}/decisions`] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQuestion("");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create decision");
    } finally {
      setSubmitting(false);
    }
  };

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, padding: 24, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: Platform.OS === "web" ? 34 : 48 },
    title: { fontSize: 20, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 20 },
    label: { fontSize: 12, fontWeight: "600" as const, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase" as const, marginBottom: 8 },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, fontSize: 16, color: colors.foreground, fontFamily: "Inter_400Regular", marginBottom: 16, minHeight: 80, textAlignVertical: "top" as const },
    errorText: { color: colors.destructive, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 },
    btn: { backgroundColor: colors.primary, height: 50, alignItems: "center" as const, justifyContent: "center" as const },
    btnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
    cancelBtn: { height: 44, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 8 },
    cancelText: { color: colors.mutedForeground, fontSize: 15, fontFamily: "Inter_400Regular" },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={s.sheet}>
            <Text style={s.title}>New Decision Room</Text>
            <Text style={s.label}>Question</Text>
            <TextInput
              style={s.input}
              value={question}
              onChangeText={setQuestion}
              placeholder="Where should we stay?"
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
            {error && <Text style={s.errorText}>{error}</Text>}
            <Pressable style={({ pressed }) => [s.cancelBtn, { opacity: pressed ? 0.6 : 1 }]} onPress={onClose}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.btn, { opacity: pressed || submitting || !question.trim() ? 0.6 : 1 }]}
              onPress={handleCreate}
              disabled={submitting || !question.trim()}
            >
              {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.btnText}>Create</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TripDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = parseInt(id ?? "0");
  const [showAddDecision, setShowAddDecision] = useState(false);

  const { data: trip, isLoading: tripLoading, error: tripError, refetch: refetchTrip } = useGetTrip(tripId);
  const { data: decisions, isLoading: decisionsLoading, refetch: refetchDecisions } = useListGroupDecisions(tripId);

  const isCoordinator = trip?.currentUserRole === "coordinator";

  const formatDate = (d: string | null | undefined) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const start = formatDate(trip?.startDate);
  const end = formatDate(trip?.endDate);
  const dateStr = start && end ? `${start} – ${end}` : start ?? null;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: topPad + 8,
      paddingBottom: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      gap: 12,
    },
    backBtn: { padding: 4 },
    headerContent: { flex: 1 },
    headerTitle: { fontSize: 20, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
    headerSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
    addBtn: {
      width: 36,
      height: 36,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionHeader: {
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
    },
    membersRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 8,
      flexWrap: "wrap",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    memberName: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
      textAlign: "center",
    },
    memberItem: { alignItems: "center", gap: 3 },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
    errorText: { color: colors.destructive, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 16 },
    retryBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10 },
    retryText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" },
    emptyDecisions: {
      padding: 32,
      alignItems: "center",
      gap: 8,
    },
    emptyDecText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
    bottomPad: { height: Platform.OS === "web" ? 34 : insets.bottom + 16 },
  });

  if (tripLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (tripError || !trip) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Could not load trip</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetchTrip()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerBar}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
          {(trip.destination ?? dateStr) && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {[trip.destination, dateStr].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
        {isCoordinator && (
          <Pressable
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddDecision(true);
            }}
            testID="add-decision-button"
          >
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </Pressable>
        )}
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={decisionsLoading}
            onRefresh={() => { refetchTrip(); refetchDecisions(); }}
            tintColor={colors.primary}
          />
        }
      >
        {trip.members && trip.members.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Members · {trip.members.length}</Text>
            </View>
            <View style={styles.membersRow}>
              {trip.members.map((m) => (
                <View key={m.userId} style={styles.memberItem}>
                  <MemberAvatar member={m} />
                  <Text style={styles.memberName} numberOfLines={1}>
                    {(m.displayName ?? "Member").split(" ")[0]}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Decisions · {decisions?.length ?? 0}
          </Text>
        </View>

        {decisionsLoading ? (
          <ActivityIndicator style={{ padding: 32 }} color={colors.primary} />
        ) : !decisions || decisions.length === 0 ? (
          <View style={styles.emptyDecisions}>
            <Feather name="layers" size={24} color={colors.mutedForeground} />
            <Text style={styles.emptyDecText}>
              {isCoordinator
                ? "Tap + to create the first decision room."
                : "No decisions yet. The coordinator will add them."}
            </Text>
          </View>
        ) : (
          decisions.map((d) => (
            <DecisionItem
              key={d.id}
              decision={d}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/decision",
                  params: { tripId: String(tripId), decId: String(d.id) },
                });
              }}
            />
          ))
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {isCoordinator && (
        <AddDecisionModal
          visible={showAddDecision}
          tripId={tripId}
          onClose={() => setShowAddDecision(false)}
        />
      )}
    </View>
  );
}
