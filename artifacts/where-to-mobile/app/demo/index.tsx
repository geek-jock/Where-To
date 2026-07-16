import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

interface DemoSave {
  id: number;
  scrapedTitle: string | null;
  placeName: string | null;
  countryCode: string | null;
  tags: string[] | null;
}

interface DemoDecision {
  id: number;
  question: string;
  resultJson: { verdict: string; travelPatterns: string[] } | null;
}

interface DemoProfile {
  id: string;
  name: string;
  initials: string;
  bio: string;
  travelStyle: string;
  saves: DemoSave[];
  decisions: DemoDecision[];
}

interface DemoTripPreview {
  id: number;
  name: string;
  destination: string | null;
  members: { name: string; initials: string }[];
  decisions: { status: string; verdictJson: { verdict: string } | null }[];
}

interface DemoData {
  profiles: DemoProfile[];
  demoTrip: DemoTripPreview | null;
  seeded: boolean;
}

export default function DemoIndex() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/demo`)
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const s = styles(colors);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Intro */}
      <View style={s.intro}>
        <Text style={s.eyebrow}>See it in action</Text>
        <Text style={s.headline}>Three travelers. Real AI output.</Text>
        <Text style={s.sub}>
          Demo profiles showing how Where To works — different travel styles, different questions, one decisive answer each time.
        </Text>
      </View>

      {/* Profiles */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !data?.seeded ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>Demo profiles haven't been seeded yet.</Text>
        </View>
      ) : (
        <View style={s.profileGrid}>
          {data.profiles.map(profile => (
            <ProfileCard key={profile.id} profile={profile} colors={colors} onPress={() => router.push({ pathname: "/demo/[profileId]", params: { profileId: profile.id } } as never)} />
          ))}
        </View>
      )}

      {/* Group trip callout */}
      {data?.demoTrip && (
        <View style={s.section}>
          <Text style={s.eyebrow}>Group trip planning</Text>
          <Text style={s.sectionTitle}>Three people. Three travel styles. One itinerary.</Text>

          <Pressable
            style={({ pressed }) => [s.tripCard, { opacity: pressed ? 0.85 : 1 }]}
            onPress={() => router.push("/demo/trip" as never)}
          >
            <View style={s.tripCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.tripName}>{data.demoTrip.name}</Text>
                {data.demoTrip.destination && (
                  <View style={s.metaRow}>
                    <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                    <Text style={s.metaText}>{data.demoTrip.destination}</Text>
                  </View>
                )}
              </View>
              <View style={s.avatarStack}>
                {data.demoTrip.members.slice(0, 3).map((m, i) => (
                  <View key={i} style={[s.avatar, { marginLeft: i > 0 ? -8 : 0 }]}>
                    <Text style={s.avatarText}>{m.initials}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={s.tripStats}>
              <View style={s.metaRow}>
                <Feather name="users" size={11} color={colors.mutedForeground} />
                <Text style={s.metaText}>{data.demoTrip.members.length} travellers</Text>
              </View>
              <View style={s.metaRow}>
                <Feather name="zap" size={11} color={colors.mutedForeground} />
                <Text style={s.metaText}>{data.demoTrip.decisions.length} decisions</Text>
              </View>
              <View style={s.metaRow}>
                <Feather name="check-circle" size={11} color={colors.mutedForeground} />
                <Text style={s.metaText}>{data.demoTrip.decisions.filter(d => d.status === "done").length} booked</Text>
              </View>
            </View>

            {data.demoTrip.decisions[0]?.verdictJson && (
              <View style={s.verdictPreview}>
                <Text style={s.verdictLabel}>Latest verdict</Text>
                <Text style={s.verdictText}>{data.demoTrip.decisions[0].verdictJson.verdict}</Text>
              </View>
            )}

            <View style={s.metaRow}>
              <Text style={[s.metaText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>See the full trip</Text>
              <Feather name="arrow-right" size={11} color={colors.primary} />
            </View>
          </Pressable>
        </View>
      )}

      {/* CTA */}
      <Pressable
        style={({ pressed }) => [s.ctaCard, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => router.replace("/sign-in")}
      >
        <Text style={s.eyebrow}>Ready to decide?</Text>
        <Text style={s.ctaTitle}>This works better with your own saves.</Text>
        <Text style={s.ctaSub}>Add places you've been thinking about and get a verdict built around your travel patterns.</Text>
        <View style={s.ctaBtn}>
          <Text style={s.ctaBtnText}>Sign In to Start</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}

function ProfileCard({
  profile,
  colors,
  onPress,
}: {
  profile: { id: string; name: string; initials: string; bio: string; travelStyle: string; saves: { tags?: string[] | null }[]; decisions: { resultJson: { verdict: string } | null }[] };
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const topTags = Array.from(
    new Set(profile.saves.flatMap(s => s.tags ?? []))
  ).slice(0, 3);
  const s = styles(colors);

  return (
    <Pressable style={({ pressed }) => [s.profileCard, { opacity: pressed ? 0.85 : 1 }]} onPress={onPress}>
      <View style={s.profileCardHeader}>
        <View style={s.profileAvatar}>
          <Text style={s.profileAvatarText}>{profile.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.profileName}>{profile.name}</Text>
          <Text style={s.profileStyle}>{profile.travelStyle}</Text>
        </View>
      </View>

      <Text style={s.profileBio} numberOfLines={3}>{profile.bio}</Text>

      <View style={s.tripStats}>
        <View style={s.metaRow}>
          <Feather name="map-pin" size={11} color={colors.mutedForeground} />
          <Text style={s.metaText}>{profile.saves.length} saves</Text>
        </View>
        <View style={s.metaRow}>
          <Feather name="zap" size={11} color={colors.mutedForeground} />
          <Text style={s.metaText}>{profile.decisions.length} decisions</Text>
        </View>
      </View>

      {topTags.length > 0 && (
        <View style={s.tags}>
          {topTags.map(tag => (
            <View key={tag} style={s.tag}>
              <Text style={s.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {profile.decisions[0]?.resultJson && (
        <View style={s.verdictPreview}>
          <Text style={s.verdictLabel}>Latest verdict</Text>
          <Text style={s.verdictText} numberOfLines={2}>{profile.decisions[0].resultJson.verdict}</Text>
        </View>
      )}

      <View style={s.metaRow}>
        <Text style={[s.metaText, { color: colors.primary, fontFamily: "Inter_600SemiBold" }]}>View decisions</Text>
        <Feather name="arrow-right" size={11} color={colors.primary} />
      </View>
    </Pressable>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    content: { paddingHorizontal: 20 },
    header: { marginBottom: 20 },
    intro: { marginBottom: 28 },
    eyebrow: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 6,
    },
    headline: {
      fontSize: 26,
      fontWeight: "700",
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 8,
      lineHeight: 32,
    },
    sub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 21,
    },
    center: { alignItems: "center", justifyContent: "center", height: 120 },
    emptyBox: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      padding: 24,
      alignItems: "center",
    },
    emptyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 },
    profileGrid: { gap: 12, marginBottom: 32 },
    profileCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 18,
      gap: 12,
    },
    profileCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    profileAvatar: {
      width: 40,
      height: 40,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    profileAvatarText: { fontSize: 14, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    profileName: { fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    profileStyle: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
    profileBio: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    tripStats: { flexDirection: "row", gap: 14 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    tag: {
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    tagText: {
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
    },
    verdictPreview: {
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 3,
    },
    verdictLabel: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.mutedForeground + "99",
      fontFamily: "Inter_600SemiBold",
    },
    verdictText: {
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      lineHeight: 18,
    },
    section: { marginBottom: 28 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 14,
      lineHeight: 24,
      marginTop: 4,
    },
    tripCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 18,
      gap: 12,
    },
    tripCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    tripName: { fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    avatarStack: { flexDirection: "row", alignItems: "center" },
    avatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primary + "22",
      borderWidth: 2,
      borderColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: { fontSize: 9, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    ctaCard: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 24,
      gap: 10,
    },
    ctaTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      lineHeight: 26,
    },
    ctaSub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 19,
    },
    ctaBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 13,
      alignItems: "center",
      marginTop: 6,
    },
    ctaBtnText: {
      color: colors.primaryForeground,
      fontSize: 15,
      fontWeight: "600",
      fontFamily: "Inter_600SemiBold",
    },
  });
}
