import {
  useGetGroupDecision,
  useCreateDecisionComment,
  useRunGroupVerdict,
  useAssignGroupDecision,
  useConfirmGroupDecision,
  useNudgeDecisionAssignee,
} from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useUser } from "@clerk/clerk-expo";
import React, { useState, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import type { DecisionComment, TripMember, GroupDecisionDetail } from "@workspace/api-client-react";

function CommentBubble({
  comment,
  members,
  currentUserId,
}: {
  comment: DecisionComment;
  members: TripMember[];
  currentUserId: string;
}) {
  const colors = useColors();
  const isMe = comment.userId === currentUserId;
  const member = members.find((m) => m.userId === comment.userId);
  const name = comment.displayName ?? member?.displayName ?? "Member";

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const formatTime = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  return (
    <View
      style={{
        flexDirection: isMe ? "row-reverse" : "row",
        alignItems: "flex-end",
        gap: 8,
        marginBottom: 12,
        paddingHorizontal: 16,
      }}
    >
      {!isMe && (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: colors.primary + "30",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600" as const, color: colors.primary, fontFamily: "Inter_600SemiBold" }}>
            {initials}
          </Text>
        </View>
      )}
      <View style={{ maxWidth: "72%", gap: 2 }}>
        {!isMe && (
          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginLeft: 2 }}>
            {name}
          </Text>
        )}
        <View
          style={{
            backgroundColor: isMe ? colors.primary : colors.card,
            borderWidth: 1,
            borderColor: isMe ? "transparent" : colors.border,
            padding: 10,
            borderRadius: 2,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              color: isMe ? colors.primaryForeground : colors.foreground,
              fontFamily: "Inter_400Regular",
              lineHeight: 20,
            }}
          >
            {comment.content}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular", alignSelf: isMe ? "flex-end" : "flex-start", marginHorizontal: 2 }}>
          {formatTime(comment.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function VerdictPanel({ decision }: { decision: GroupDecisionDetail }) {
  const colors = useColors();
  const verdict = decision.verdictJson as any;
  if (!verdict) return null;

  return (
    <View
      style={{
        margin: 16,
        borderWidth: 1,
        borderColor: colors.primary + "40",
        backgroundColor: colors.primary + "08",
        padding: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Feather name="award" size={16} color={colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: "700" as const, color: colors.primary, fontFamily: "Inter_700Bold", letterSpacing: 0.4, textTransform: "uppercase" }}>
          AI Verdict
        </Text>
      </View>
      {verdict.verdict && (
        <Text style={{ fontSize: 16, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 8, lineHeight: 22 }}>
          {verdict.verdict}
        </Text>
      )}
      {verdict.coreConflict && (
        <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 8 }}>
          {verdict.coreConflict}
        </Text>
      )}
      {verdict.whoGetsWhat && Object.entries(verdict.whoGetsWhat).length > 0 && (
        <View style={{ marginTop: 8, gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "600" as const, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>
            Assignments
          </Text>
          {Object.entries(verdict.whoGetsWhat).map(([name, detail]) => (
            <View key={name} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <Text style={{ fontSize: 13, fontWeight: "600" as const, color: colors.foreground, fontFamily: "Inter_600SemiBold", minWidth: 60 }}>
                {name}:
              </Text>
              <Text style={{ flex: 1, fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                {String(detail)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AssignModal({
  visible,
  members,
  onAssign,
  onClose,
}: {
  visible: boolean;
  members: TripMember[];
  onAssign: (userId: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        onPress={onClose}
      >
        <Pressable onPress={e => e.stopPropagation()}>
          <View style={{
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingVertical: 16,
            paddingBottom: Platform.OS === "web" ? 34 : 48,
          }}>
            <Text style={{ fontSize: 18, fontWeight: "700" as const, color: colors.foreground, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 12 }}>
              Assign to…
            </Text>
            {members.map((m) => (
              <Pressable
                key={m.userId}
                style={({ pressed }) => ({
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  backgroundColor: pressed ? colors.muted : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                })}
                onPress={() => {
                  onAssign(m.userId);
                  onClose();
                }}
              >
                <Feather name="user" size={18} color={colors.mutedForeground} />
                <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}>
                  {m.displayName ?? "Member"}
                </Text>
                {m.role === "coordinator" && (
                  <Text style={{ fontSize: 11, color: colors.primary, fontFamily: "Inter_500Medium" }}>(Coordinator)</Text>
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DecisionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tripId, decId } = useLocalSearchParams<{ tripId: string; decId: string }>();
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { user } = useUser();

  const tripIdNum = parseInt(tripId ?? "0");
  const decIdNum = parseInt(decId ?? "0");

  const [comment, setComment] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const {
    data: decision,
    isLoading,
    error,
    refetch,
  } = useGetGroupDecision(tripIdNum, decIdNum);

  const createComment = useCreateDecisionComment();
  const runVerdict = useRunGroupVerdict();
  const assign = useAssignGroupDecision();
  const confirm = useConfirmGroupDecision();
  const nudge = useNudgeDecisionAssignee();

  const isCoordinator = decision?.members?.some(
    (m) => m.userId === userId && m.role === "coordinator"
  );
  const isAssignee = decision?.assignedTo === userId;
  const queryKey = [`/api/trips/${tripIdNum}/decisions/${decIdNum}`];

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey });
  };

  const handleSendComment = async () => {
    if (!comment.trim() || actionLoading) return;
    const text = comment.trim();
    setComment("");
    setActionLoading(true);
    try {
      await createComment.mutateAsync({
        id: tripIdNum,
        decId: decIdNum,
        data: {
          content: text,
          displayName: user?.fullName ?? user?.firstName ?? undefined,
        },
      });
      await invalidate();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setActionLoading(false);
  };

  const handleRunVerdict = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await runVerdict.mutateAsync({ id: tripIdNum, decId: decIdNum });
      await invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setActionLoading(false);
  };

  const handleAssign = async (targetUserId: string) => {
    setActionLoading(true);
    try {
      await assign.mutateAsync({ id: tripIdNum, decId: decIdNum, data: { assignedTo: targetUserId } });
      await invalidate();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setActionLoading(false);
  };

  const handleConfirm = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await confirm.mutateAsync({ id: tripIdNum, decId: decIdNum });
      await invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
    setActionLoading(false);
  };

  const handleNudge = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      await nudge.mutateAsync({ id: tripIdNum, decId: decIdNum });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
    setActionLoading(false);
  };

  const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    undecided: { label: "Open", color: "#e6a800" },
    assigned: { label: "Assigned", color: "#2196F3" },
    done: { label: "Booked", color: "#4CAF50" },
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const s = StyleSheet.create({
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
    headerQuestion: { flex: 1, fontSize: 16, fontWeight: "600" as const, color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
    commentsArea: { flex: 1 },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      paddingBottom: bottomPad + 10,
      gap: 8,
    },
    textInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      maxHeight: 100,
      minHeight: 44,
    },
    sendBtn: {
      width: 44,
      height: 44,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    actionsBar: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    actionBtn: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 6,
    },
    actionBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: "transparent",
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    actionBtnTextPrimary: {
      color: colors.primaryForeground,
    },
    confirmBtn: {
      flexDirection: "row",
      alignItems: "center",
      margin: 16,
      backgroundColor: "#4CAF50",
      paddingHorizontal: 20,
      paddingVertical: 14,
      justifyContent: "center",
      gap: 8,
    },
    confirmText: {
      fontSize: 16,
      fontWeight: "700" as const,
      color: "#fff",
      fontFamily: "Inter_700Bold",
    },
  });

  if (isLoading) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !decision) {
    return (
      <View style={s.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.loadingContainer}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_400Regular" }}>
            Could not load decision
          </Text>
        </View>
      </View>
    );
  }

  const statusCfg = STATUS_CONFIG[decision.status] ?? { label: decision.status, color: "#888" };
  const members = decision.members ?? [];
  const comments = [...(decision.comments ?? [])].reverse();

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={s.headerBar}>
        <Pressable
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerQuestion} numberOfLines={2}>{decision.question}</Text>
        <View
          style={{
            backgroundColor: statusCfg.color + "20",
            borderWidth: 1,
            borderColor: statusCfg.color + "50",
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600" as const, color: statusCfg.color, fontFamily: "Inter_600SemiBold" }}>
            {statusCfg.label.toUpperCase()}
          </Text>
        </View>
      </View>

      {(isCoordinator || (isAssignee && decision.status === "assigned")) && (
        <View style={s.actionsBar}>
          {isCoordinator && decision.status !== "done" && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, s.actionBtnPrimary, { opacity: pressed || actionLoading ? 0.7 : 1 }]}
              onPress={handleRunVerdict}
              disabled={actionLoading}
            >
              {actionLoading && runVerdict.isPending ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather name="zap" size={14} color={colors.primaryForeground} />
              )}
              <Text style={[s.actionBtnText, s.actionBtnTextPrimary]}>Run Verdict</Text>
            </Pressable>
          )}
          {isCoordinator && decision.status !== "done" && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, { opacity: pressed || actionLoading ? 0.7 : 1 }]}
              onPress={() => setShowAssign(true)}
              disabled={actionLoading}
            >
              <Feather name="user-plus" size={14} color={colors.foreground} />
              <Text style={s.actionBtnText}>Assign</Text>
            </Pressable>
          )}
          {isCoordinator && decision.status === "assigned" && (
            <Pressable
              style={({ pressed }) => [s.actionBtn, { opacity: pressed || actionLoading ? 0.7 : 1 }]}
              onPress={handleNudge}
              disabled={actionLoading}
            >
              <Feather name="bell" size={14} color={colors.foreground} />
              <Text style={s.actionBtnText}>Nudge</Text>
            </Pressable>
          )}
        </View>
      )}

      {decision.verdictJson && <VerdictPanel decision={decision} />}

      {isAssignee && decision.status === "assigned" && (
        <Pressable
          style={({ pressed }) => [s.confirmBtn, { opacity: pressed || actionLoading ? 0.7 : 1 }]}
          onPress={handleConfirm}
          disabled={actionLoading}
          testID="confirm-booked-button"
        >
          {actionLoading && confirm.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Feather name="check-circle" size={20} color="#fff" />
          )}
          <Text style={s.confirmText}>Confirm Booked</Text>
        </Pressable>
      )}

      <FlatList
        style={s.commentsArea}
        data={comments}
        keyExtractor={(c) => String(c.id)}
        inverted
        contentContainerStyle={{ paddingVertical: 12, flexDirection: "column-reverse" }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <CommentBubble
            comment={item}
            members={members}
            currentUserId={userId ?? ""}
          />
        )}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Feather name="message-circle" size={24} color={colors.mutedForeground} />
            <Text style={{ marginTop: 8, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
              No comments yet. Share your thoughts.
            </Text>
          </View>
        }
      />

      <View style={s.inputRow}>
        <TextInput
          style={s.textInput}
          value={comment}
          onChangeText={setComment}
          placeholder="Add a comment…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSendComment}
          testID="comment-input"
        />
        <Pressable
          style={({ pressed }) => [
            s.sendBtn,
            { opacity: pressed || !comment.trim() || actionLoading ? 0.5 : 1 },
          ]}
          onPress={handleSendComment}
          disabled={!comment.trim() || actionLoading}
          testID="send-comment-button"
        >
          <Feather name="send" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <AssignModal
        visible={showAssign}
        members={members}
        onAssign={handleAssign}
        onClose={() => setShowAssign(false)}
      />
    </KeyboardAvoidingView>
  );
}
