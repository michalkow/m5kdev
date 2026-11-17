import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { Typography } from "heroui-native";
import { View } from "react-native";

export function LoadingScreen() {
  const { appName } = useAppConfig();
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Typography.Paragraph testID="loading-state">
        {appName} — Loading auth session...
      </Typography.Paragraph>
    </View>
  );
}
