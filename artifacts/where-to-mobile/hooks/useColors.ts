import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

export function useColors() {
  const scheme = useColorScheme();
  if (scheme === "dark") {
    return { ...colors.dark, radius: colors.radius };
  }
  return { ...colors.light, radius: colors.radius };
}
