import { useSignIn, useOAuth, useAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/(tabs)/trips");
    }
  }, [isSignedIn]);

  const onEmailSignIn = async () => {
    if (!isLoaded || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)/trips");
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      if (clerkError?.code === "session_exists") {
        router.replace("/(tabs)/trips");
        return;
      }
      setError(clerkError?.message ?? "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const onGoogleSignIn = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { createdSessionId, setActive: oauthSetActive } = await startOAuthFlow();
      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId });
        router.replace("/(tabs)/trips");
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      if (clerkError?.code === "session_exists") {
        router.replace("/(tabs)/trips");
        return;
      }
      setError(clerkError?.message ?? "Google sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === "web" ? 67 : insets.top,
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 32,
      justifyContent: "center",
    },
    badge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 32,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 6,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 36,
      lineHeight: 22,
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
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      marginBottom: 16,
      paddingHorizontal: 14,
      height: 50,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    errorBox: {
      backgroundColor: "#fff0f0",
      borderWidth: 1,
      borderColor: "#ffc0c0",
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    primaryButton: {
      backgroundColor: colors.primary,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    primaryButtonText: {
      color: colors.primaryForeground,
      fontSize: 16,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 12,
      gap: 12,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    googleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      height: 50,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      gap: 10,
    },
    googleButtonText: {
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    demoLink: {
      alignItems: "center",
      paddingVertical: 16,
    },
    demoLinkText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.badge}>
          <Feather name="map-pin" size={24} color={colors.primaryForeground} />
        </View>
        <Text style={styles.title}>Where To</Text>
        <Text style={styles.subtitle}>
          Plan trips with your group. Sign in to see your trips and decisions.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword(!showPassword)}>
            <Feather
              name={showPassword ? "eye-off" : "eye"}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { opacity: pressed || loading ? 0.75 : 1 },
          ]}
          onPress={onEmailSignIn}
          disabled={loading || !email || !password}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.primaryButtonText}>Sign In</Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.googleButton,
            { opacity: pressed || loading ? 0.75 : 1 },
          ]}
          onPress={onGoogleSignIn}
          disabled={loading}
        >
          <Feather name="globe" size={18} color={colors.foreground} />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.demoLink, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.push("/demo" as never)}
        >
          <Text style={styles.demoLinkText}>Explore the demo first →</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
