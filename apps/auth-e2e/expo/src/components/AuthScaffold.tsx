import { Card, Typography } from "heroui-native";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { appTitle } from "../config";

export function AuthScaffold({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="flex-grow px-5 py-8">
      <View className="flex-1 justify-center gap-5">
        <View className="gap-2">
          <Text className="text-center text-xs font-semibold uppercase tracking-widest text-default-500">
            Expo auth fixture
          </Text>
          <Text className="text-center text-3xl font-semibold text-foreground">{appTitle}</Text>
          <Typography.Paragraph className="text-center text-default-600">
            {description ?? "Native auth screens backed by @m5kdev/frontend."}
          </Typography.Paragraph>
        </View>
        <Card className="gap-5 p-5">
          <Text className="text-xl font-semibold text-foreground">{title}</Text>
          {children}
        </Card>
      </View>
    </ScrollView>
  );
}
