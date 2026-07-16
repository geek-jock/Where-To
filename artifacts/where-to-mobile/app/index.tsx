import { Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f3ee" }}>
        <ActivityIndicator color="#7c8a42" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)/trips" />;
  }

  return <Redirect href="/sign-in" />;
}
