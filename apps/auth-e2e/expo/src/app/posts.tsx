import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Link, Redirect } from "expo-router";
import { Button, Card, Typography } from "heroui-native";
import { ScrollView, Text, View } from "react-native";

export default function PostsScreen() {
  const { data: session } = useSession();

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-5 py-8">
      <View className="gap-5">
        <View className="gap-2">
          <Text className="text-3xl font-semibold text-foreground">Editorial posts</Text>
          <Typography.Paragraph className="text-default-600">
            A small blog that protects auth changes across web and Expo.
          </Typography.Paragraph>
          <Text testID="session-email" className="text-sm text-default-600">
            {session.user.email}
          </Text>
        </View>
        <Card className="gap-2 p-5">
          <Text className="text-lg font-semibold text-foreground">Native fixture post</Text>
          <Typography.Paragraph>
            This protected screen is rendered by Expo Router and authenticated through
            @m5kdev/frontend.
          </Typography.Paragraph>
        </Card>
        <Link href="/logout" asChild>
          <Button testID="logout-submit" variant="outline">
            Logout
          </Button>
        </Link>
      </View>
    </ScrollView>
  );
}
