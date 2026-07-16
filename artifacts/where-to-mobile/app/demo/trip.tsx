import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import type { GroupVerdictJson } from "@workspace/api-client-react";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

interface DemoComment {
  id: number;
  userId: string;
  displayName: string | null;
  content: string;
  createdAt: string;
}

interface DemoGroupDecision {
  id: number;
  question: string;
  status: string;
  verdictJson: GroupVerdictJson | null;
  assignedTo: string | null;
  costPerPax: string | null;
  comments: DemoComment[];
}

interface DemoMember {
  userId: string;
  role: string;
  name: string;
  initials: string;
}

interface DemoTrip {
  id: number;
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  members: DemoMember[];
  decisions: DemoGroupDecision[];
}

function formatDate(d: string | null) {
  if (!d) return null;
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DemoTrip() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [trip, setTrip] = useState<DemoTrip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/demo`)
      .then(r => r.json())
      .then((data: { demoTrip?: DemoTrip | null }) => {
        setTrip(data.demoTrip ?? null);
      })
      .catch(() => setTrip(null))
      .finally(() => setLoading(false));
  }, []);

  const s = styles(colors);
  const start = formatDate(trip?.startDate ?? null);
  const end = formatDate(trip?.endDate ?? null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.row}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
        </Pressable>
        <Text style={s.headerLabel}>Group trip</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !trip ? (
        <View style={s.center}>
          <Text style={s.muted}>Demo trip not found. Run the seed script to generate it.</Text>
          <Pressable onPress={() => router.back()} style={s.backLink}>
            <Text style={s.linkText}>← Back to demo profiles</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Trip header */}
          <View style={s.section}>
            <Text style={s.tripName}>{trip.name}</Text>
            <View style={s.metaGroup}>
              {trip.destination && (
                <View style={s.metaRow}>
                  <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                  <Text style={s.metaText}>{trip.destination}</Text>
                </View>
              )}
              {start && end && (
                <View style={s.metaRow}>
                  <Feather name="calendar" size={12} color={colors.mutedForeground} />
                  <Text style={s.metaText}>{start} – {end}</Text>
                </View>
              )}
              <View style={s.metaRow}>
                <Feather name="users" size={12} color={colors.mutedForeground} />
                <Text style={s.metaText}>{trip.members.length} travellers</Text>
              </View>
            </View>

            {/* Members */}
            <View style={s.members}>
              {trip.members.map(m => (
                <View key={m.userId} style={s.memberRow}>
                  <View style={s.memberAvatar}>
                    <Text style={s.memberInitials}>{m.initials}</Text>
                  </View>
                  <View>
                    <Text style={s.memberName}>{m.name}</Text>
                    {m.role === "coordinator" && (
                      <Text style={s.memberRole}>coordinator</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* How it works */}
          <View style={s.explainer}>
            <Text style={s.explainerTitle}>How group decisions work</Text>
            <Text style={s.explainerText}>
              The coordinator opens a question. Members discuss in comments. When ready, Where To reads everyone's personal saves and travel profiles to generate a verdict — with a specific assignment for each person.
            </Text>
          </View>

          {/* Decisions */}
          <View style={s.decisionSection}>
            <Text style={s.eyebrow}>Decisions · {trip.decisions.length}</Text>
            {trip.decisions.map(dec => (
              <DecisionCard key={dec.id} dec={dec} members={trip.members} colors={colors} />
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [s.ctaCard, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.replace("/sign-in")}
          >
            <Text style={s.eyebrow}>Plan a trip with your group</Text>
            <Text style={s.ctaTitle}>Every person brings their saves. The AI assigns everyone something they'll actually want.</Text>
            <View style={s.ctaBtn}>
              <Text style={s.ctaBtnText}>Start Planning</Text>
            </View>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  if (status === "done") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0", paddingHorizontal: 8, paddingVertical: 3 }}>
        <Feather name="check-circle" size={10} color="#15803d" />
        <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: "#15803d", fontFamily: "Inter_600SemiBold" }}>Booked</Text>
      </View>
    );
  }
  if (status === "assigned") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", paddingHorizontal: 8, paddingVertical: 3 }}>
        <Feather name="clock" size={10} color="#92400e" />
        <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: "#92400e", fontFamily: "Inter_600SemiBold" }}>Needs booking</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Feather name="message-square" size={10} color={colors.mutedForeground} />
      <Text style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>Open question</Text>
    </View>
  );
}

function DecisionCard({ dec, members, colors }: { dec: DemoGroupDecision; members: DemoMember[]; colors: ReturnType<typeof useColors> }) {
  const s = styles(colors);
  const assignee = members.find(m => m.userId === dec.assignedTo);

  return (
    <View style={s.decisionCard}>
      {/* Question header */}
      <View style={s.decisionHeader}>
        <Text style={s.decisionQuestion}>{dec.question}</Text>
        <StatusBadge status={dec.status} colors={colors} />
        {assignee && (
          <Text style={s.assigneeText}>
            {dec.status === "done" ? "Booked by " : "Assigned to "}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{assignee.name}</Text>
            {dec.costPerPax ? <Text style={{ color: colors.mutedForeground }}> · {dec.costPerPax}/person</Text> : null}
          </Text>
        )}
      </View>

      {/* Verdict */}
      {dec.verdictJson ? (
        <View style={s.verdictSection}>
          <Text style={s.verdictEyebrow}>The verdict</Text>
          <Text style={s.verdictHeadline}>{dec.verdictJson.verdict}</Text>

          {dec.verdictJson.whyThisFits && (
            <Text style={s.verdictBody}>{dec.verdictJson.whyThisFits}</Text>
          )}

          {dec.verdictJson.whoGetsWhat && dec.verdictJson.whoGetsWhat.length > 0 && (
            <View style={s.whoGetsWhat}>
              <Text style={s.wgwLabel}>Who gets what</Text>
              {dec.verdictJson.whoGetsWhat.map((item, i) => (
                <View key={i} style={s.wgwRow}>
                  <Text style={s.wgwName}>{item.memberName}</Text>
                  <Text style={s.wgwDash}> — </Text>
                  <Text style={s.wgwAssignment}>{item.assignment}</Text>
                </View>
              ))}
            </View>
          )}

          {dec.verdictJson.theSeam && (
            <View style={s.seam}>
              <Text style={s.seamText}>{dec.verdictJson.theSeam}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={s.verdictSection}>
          <Text style={[s.verdictBody, { fontStyle: "italic" }]}>No verdict yet — the group is still discussing.</Text>
        </View>
      )}

      {/* Comments */}
      {dec.comments.length > 0 && (
        <View style={s.commentsSection}>
          <Text style={s.commentsLabel}>Discussion · {dec.comments.length}</Text>
          {dec.comments.map(comment => {
            const member = members.find(m => m.userId === comment.userId);
            const initials = member?.initials ?? comment.displayName?.slice(0, 2).toUpperCase() ?? "?";
            return (
              <View key={comment.id} style={s.commentRow}>
                <View style={s.commentAvatar}>
                  <Text style={s.commentAvatarText}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.commentAuthor}>{comment.displayName ?? member?.name ?? comment.userId}</Text>
                  <Text style={s.commentContent}>{comment.content}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    content: { paddingHorizontal: 20, gap: 0 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
    headerLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
    muted: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 },
    backLink: { marginTop: 8 },
    linkText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    section: { marginBottom: 24 },
    tripName: { fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 12, lineHeight: 34 },
    metaGroup: { gap: 6, marginBottom: 20 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    members: { gap: 12 },
    memberRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    memberAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary + "1a",
      alignItems: "center",
      justifyContent: "center",
    },
    memberInitials: { fontSize: 11, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    memberName: { fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    memberRole: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    explainer: {
      backgroundColor: colors.muted + "88",
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 24,
      gap: 6,
    },
    explainerTitle: { fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    explainerText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    eyebrow: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 12,
    },
    decisionSection: { gap: 12, marginBottom: 32 },
    decisionCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
    decisionHeader: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    decisionQuestion: { fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", lineHeight: 22 },
    assigneeText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    verdictSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
    verdictEyebrow: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.primary + "99",
      fontFamily: "Inter_600SemiBold",
    },
    verdictHeadline: { fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", lineHeight: 26 },
    verdictBody: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    whoGetsWhat: { gap: 6 },
    wgwLabel: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.mutedForeground + "99",
      fontFamily: "Inter_600SemiBold",
      marginBottom: 4,
    },
    wgwRow: { flexDirection: "row", alignItems: "flex-start" },
    wgwName: { fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    wgwDash: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    wgwAssignment: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1, fontStyle: "italic" },
    seam: {
      borderLeftWidth: 2,
      borderLeftColor: colors.primary,
      paddingLeft: 12,
    },
    seamText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19, fontStyle: "italic" },
    commentsSection: { padding: 16, gap: 12 },
    commentsLabel: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.mutedForeground + "99",
      fontFamily: "Inter_600SemiBold",
    },
    commentRow: { flexDirection: "row", gap: 10 },
    commentAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary + "1a",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    commentAvatarText: { fontSize: 9, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    commentAuthor: { fontSize: 12, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    commentContent: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    ctaCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 24,
      gap: 10,
    },
    ctaTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", lineHeight: 24 },
    ctaBtn: { backgroundColor: colors.primary, paddingVertical: 13, alignItems: "center", marginTop: 6 },
    ctaBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  });
}
