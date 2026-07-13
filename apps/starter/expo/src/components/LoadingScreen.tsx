import { Typography } from "heroui-native";
import { View } from "react-native";

export function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Typography.Paragraph testID="loading-state">Loading auth session...</Typography.Paragraph>
    </View>
  );
}
