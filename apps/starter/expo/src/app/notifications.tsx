import { useNativePush } from "@m5kdev/expo/hooks/useNativePush";
import { NotificationInbox } from "@m5kdev/expo/modules/notification/components/NotificationInbox";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Link, Redirect } from "expo-router";
import { Button, Card, Typography } from "heroui-native";
import { ScrollView, Text, View } from "react-native";
import { useTRPC } from "../lib/trpc";

export default function NotificationsScreen() {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const nativePush = useNativePush({
    enabled: Boolean(session?.user?.id),
    messages: {
      unsupported: "Native push is not available on this platform.",
      denied: "Notification permission was denied.",
      noToken: "Could not read a device push token.",
      failed: "Could not register this device.",
      enabled: "This device is registered for push.",
    },
    registerDeviceMutation: trpc.notification.registerDevice.mutationOptions(),
  });

  if (!session) {
    return <Redirect href="/login" />;
  }

  const pushLabel =
    nativePush.flowStatus === "done"
      ? "This device is registered for push."
      : nativePush.permission === "denied"
        ? "Notification permission was denied."
        : "Enable push for this device";

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-5 py-8">
      <View className="gap-5">
        <View className="gap-2">
          <Text className="text-3xl font-semibold text-foreground">Notifications</Text>
          <Typography.Paragraph className="text-default-600">
            Inbox for this membership. Push registration is this User's device.
          </Typography.Paragraph>
        </View>
        <Card className="gap-3 p-5">
          <Text className="text-lg font-semibold text-foreground">This device</Text>
          <Button
            isDisabled={!nativePush.canSubscribe || nativePush.isWorking}
            onPress={() => {
              void nativePush.subscribe();
            }}
          >
            {pushLabel}
          </Button>
          {nativePush.feedback ? (
            <Typography.Paragraph className="text-default-600">
              {nativePush.feedback}
            </Typography.Paragraph>
          ) : null}
        </Card>
        <Card className="gap-3 p-5">
          <Text className="text-lg font-semibold text-foreground">Inbox</Text>
          <NotificationInbox />
        </Card>
        <Link href="/posts" asChild>
          <Button variant="outline">Back to posts</Button>
        </Link>
      </View>
    </ScrollView>
  );
}
