import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import type { VerdictJson } from "@workspace/api-client-react";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

interface DemoSave {
  id: number;
  url: string | null;
  note: string | null;
  scrapedTitle: string | null;
  placeName: string | null;
  countryCode: string | null;
  tags: string[] | null;
}

interface DemoDecision {
  id: number;
  question: string;
  result: string;
  resultJson: VerdictJson | null;
  createdAt: string;
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

function getDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "maps.app.goo.gl") return "google maps";
    if (host.startsWith("reddit.com")) return "reddit";
    if (host.startsWith("instagram.com")) return "instagram";
    if (host.startsWith("youtube.com")) return "youtube";
    if (host.startsWith("airbnb.com")) return "airbnb";
    if (host.startsWith("alltrails.com")) return "alltrails";
    return host;
  } catch {
    return null;
  }
}

type Tab = "question" | "library";

export default function DemoProfile() {
  const params = useLocalSearchParams<{ profileId: string | string[] }>();
  const profileId = Array.isArray(params.profileId) ? params.profileId[0] : params.profileId;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<DemoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("question");
  const [activeDecisionId, setActiveDecisionId] = useState<number | null>(null);

  const loadProfile = (id: string) => {
    setLoading(true);
    setFetchError(false);
    fetch(`${API_BASE}/demo/profiles/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DemoProfile>;
      })
      .then(found => {
        setProfile(found);
        if (found?.decisions?.[0]) {
          setActiveDecisionId(found.decisions[0].id);
        }
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (profileId) loadProfile(profileId);
  }, [profileId]);

  const s = styles(colors);
  const activeDecision = profile?.decisions.find(d => d.id === activeDecisionId) ?? null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <Pressable style={s.backRow} onPress={() => router.back()} hitSlop={12}>
        <Feather name="arrow-left" size={18} color={colors.mutedForeground} />
        <Text style={s.backText}>All demo profiles</Text>
      </Pressable>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : fetchError ? (
        <View style={s.center}>
          <Text style={s.muted}>Couldn't load profile — check your connection.</Text>
          <Pressable onPress={() => profileId && loadProfile(profileId)} style={{ marginTop: 8 }}>
            <Text style={s.linkText}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ marginTop: 4 }}>
            <Text style={[s.muted, { fontSize: 12 }]}>← Back</Text>
          </Pressable>
        </View>
      ) : !profile ? (
        <View style={s.center}>
          <Text style={s.muted}>Profile not found.</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={s.linkText}>← Back to demo profiles</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Profile header */}
          <View style={s.profileHeader}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{profile.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{profile.name}</Text>
              <Text style={s.travelStyle}>{profile.travelStyle}</Text>
              <Text style={s.bio}>{profile.bio}</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={s.tabs}>
            {(["question", "library"] as Tab[]).map(tab => (
              <Pressable
                key={tab}
                style={[s.tab, activeTab === tab && s.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                  {tab === "question"
                    ? `Question · ${profile.decisions.length}`
                    : `Library · ${profile.saves.length}`}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Question tab */}
          {activeTab === "question" && (
            <View style={s.tabContent}>
              {/* Decision selector */}
              {profile.decisions.length > 1 && (
                <View style={s.decisionPicker}>
                  {profile.decisions.map(d => (
                    <Pressable
                      key={d.id}
                      style={[s.decisionChip, activeDecisionId === d.id && s.decisionChipActive]}
                      onPress={() => setActiveDecisionId(d.id)}
                    >
                      <Text
                        style={[s.decisionChipText, activeDecisionId === d.id && s.decisionChipTextActive]}
                        numberOfLines={2}
                      >
                        {d.resultJson?.verdict ?? d.question.slice(0, 50) + "…"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {activeDecision?.resultJson ? (
                <VerdictCard verdict={activeDecision.resultJson} question={activeDecision.question} colors={colors} />
              ) : activeDecision ? (
                <View style={s.rawResult}>
                  <Text style={s.rawQuestion}>{activeDecision.question}</Text>
                  <Text style={s.rawText}>{activeDecision.result}</Text>
                </View>
              ) : null}

              {/* CTA */}
              {activeDecision && (
                <View style={s.ctaRow}>
                  <Text style={s.ctaSub}>
                    This is a real AI verdict, built from {profile.name.split(" ")[0]}'s saves. Yours would come from your own.
                  </Text>
                  <Pressable style={s.ctaBtn} onPress={() => router.replace("/sign-in")}>
                    <Text style={s.ctaBtnText}>Start with your saves</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Library tab */}
          {activeTab === "library" && (
            <View style={s.tabContent}>
              {profile.saves.map(save => (
                <SaveRow key={save.id} save={save} colors={colors} />
              ))}
              <View style={s.ctaRow}>
                <Text style={s.ctaSub}>Save links like these — then ask Where To to decide.</Text>
                <Pressable style={s.ctaBtn} onPress={() => router.replace("/sign-in")}>
                  <Text style={s.ctaBtnText}>Start with your saves</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function VerdictCard({ verdict, question, colors }: { verdict: VerdictJson; question: string; colors: ReturnType<typeof useColors> }) {
  const s = styles(colors);
  return (
    <View style={s.verdictCard}>
      <View style={s.verdictHeader}>
        <Text style={s.verdictEyebrow}>The question</Text>
        <Text style={s.verdictQuestion}>{question}</Text>
      </View>

      <View style={s.verdictBody}>
        <Text style={s.verdictEyebrow}>The verdict</Text>
        <Text style={s.verdictHeadline}>{verdict.verdict}</Text>
      </View>

      {verdict.whyThisFits && (
        <View style={s.verdictSection}>
          <Text style={s.verdictSectionLabel}>Why this fits</Text>
          <Text style={s.verdictText}>{verdict.whyThisFits}</Text>
        </View>
      )}

      {verdict.coreConflict && (
        <View style={s.verdictSection}>
          <Text style={s.verdictSectionLabel}>Core conflict</Text>
          <Text style={s.verdictText}>{verdict.coreConflict}</Text>
        </View>
      )}

      {verdict.tradeoffs && (
        <View style={s.verdictSection}>
          <Text style={s.verdictSectionLabel}>Tradeoffs</Text>
          <Text style={s.verdictText}>{verdict.tradeoffs}</Text>
        </View>
      )}

      {verdict.nextMove && (
        <View style={s.verdictSection}>
          <Text style={s.verdictSectionLabel}>Next move</Text>
          <Text style={s.verdictText}>{verdict.nextMove}</Text>
        </View>
      )}

      {verdict.avoidIf && verdict.avoidIf.length > 0 && (
        <View style={s.verdictSection}>
          <Text style={s.verdictSectionLabel}>Avoid if</Text>
          {verdict.avoidIf.map((a, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Text style={s.bullet}>·</Text>
              <Text style={s.verdictText}>{a}</Text>
            </View>
          ))}
        </View>
      )}

      {verdict.travelPatterns && verdict.travelPatterns.length > 0 && (
        <View style={s.patternsSection}>
          <Text style={s.verdictSectionLabel}>Travel patterns</Text>
          <View style={s.patternTags}>
            {verdict.travelPatterns.map((p, i) => (
              <View key={i} style={s.patternTag}>
                <Text style={s.patternTagText}>{p}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function SaveRow({ save, colors }: { save: DemoSave; colors: ReturnType<typeof useColors> }) {
  const s = styles(colors);
  const domain = getDomain(save.url);
  return (
    <View style={s.saveRow}>
      <View style={s.savePlace}>
        <Text style={s.savePlaceName}>{save.placeName}</Text>
        {save.countryCode && <Text style={s.saveCountry}> {save.countryCode}</Text>}
      </View>
      <View style={s.saveInfo}>
        {save.note && <Text style={s.saveNote}>{save.note}</Text>}
        {save.url && (
          <Pressable onPress={() => save.url && Linking.openURL(save.url)} style={s.saveLink}>
            <Feather name="external-link" size={11} color={colors.mutedForeground + "66"} />
            <Text style={s.saveLinkText} numberOfLines={1}>
              {save.scrapedTitle ?? domain ?? save.url}
            </Text>
          </Pressable>
        )}
        {save.tags && save.tags.length > 0 && (
          <View style={s.tags}>
            {save.tags.slice(0, 3).map(tag => (
              <View key={tag} style={s.tag}>
                <Text style={s.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    content: { paddingHorizontal: 20 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 24 },
    backText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
    muted: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 },
    linkText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    profileHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 28 },
    avatar: {
      width: 48,
      height: 48,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    avatarText: { fontSize: 16, fontWeight: "700", color: colors.primary, fontFamily: "Inter_700Bold" },
    name: { fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    travelStyle: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
    bio: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 19 },
    tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 20 },
    tab: { paddingHorizontal: 4, paddingBottom: 12, marginRight: 20, borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.foreground },
    tabText: { fontSize: 14, fontWeight: "500", color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    tabTextActive: { color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    tabContent: { gap: 20 },
    decisionPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    decisionChip: {
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: "100%",
    },
    decisionChipActive: { borderColor: colors.primary + "88", backgroundColor: colors.primary + "0d" },
    decisionChipText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    decisionChipTextActive: { color: colors.foreground, fontFamily: "Inter_500Medium" },
    verdictCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    verdictHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 },
    verdictBody: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 },
    verdictEyebrow: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.primary + "99",
      fontFamily: "Inter_600SemiBold",
    },
    verdictQuestion: { fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
    verdictHeadline: { fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", lineHeight: 28 },
    verdictSection: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
    verdictSectionLabel: {
      fontSize: 9,
      fontWeight: "600",
      letterSpacing: 1,
      textTransform: "uppercase",
      color: colors.mutedForeground + "99",
      fontFamily: "Inter_600SemiBold",
    },
    verdictText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    bullet: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
    patternsSection: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
    patternTags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    patternTag: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 },
    patternTagText: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    rawResult: { gap: 12 },
    rawQuestion: { fontSize: 18, color: colors.foreground, fontFamily: "Inter_600SemiBold", lineHeight: 24, borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 12, fontStyle: "italic" },
    rawText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    ctaRow: {
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    ctaSub: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 19 },
    ctaBtn: { backgroundColor: colors.primary, paddingVertical: 12, alignItems: "center" },
    ctaBtnText: { color: colors.primaryForeground, fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
    saveRow: {
      flexDirection: "row",
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    savePlace: { width: 90, flexShrink: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" },
    savePlaceName: { fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    saveCountry: { fontSize: 11, color: colors.mutedForeground + "80", fontFamily: "Inter_400Regular" },
    saveInfo: { flex: 1, gap: 6 },
    saveNote: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18 },
    saveLink: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
    saveLinkText: { fontSize: 12, color: colors.foreground + "cc", fontFamily: "Inter_400Regular", flex: 1 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    tag: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 2 },
    tagText: { fontSize: 9, color: colors.mutedForeground + "80", fontFamily: "Inter_400Regular" },
  });
}
