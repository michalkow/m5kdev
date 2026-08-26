import { Button } from "@heroui/react";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useWebPush } from "@m5kdev/web-ui/hooks/useWebPush";
import { BellRingIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTRPC } from "../../utils/trpc";

export function StarterWebPush() {
  const { t } = useTranslation("starter-app");
  const { data: session } = useSession();
  const trpc = useTRPC();
  const webPush = useWebPush({
    enabled: Boolean(session?.user?.id),
    messages: {
      unsupported: t("layout.push.unsupported"),
      denied: t("layout.push.denied"),
      noVapid: t("layout.push.noVapid"),
      badSubscription: t("layout.push.badSubscription"),
      failed: t("layout.push.failed"),
      enabled: t("layout.push.enabled"),
    },
    vapidPublicKeyQuery: trpc.notification.vapidPublicKey.queryOptions(),
    registerDeviceMutation: trpc.notification.registerDevice.mutationOptions(),
  });

  if (!session?.user?.id) return null;

  const label =
    webPush.flowStatus === "done"
      ? t("layout.push.enabled")
      : webPush.permission === "denied"
        ? t("layout.push.denied")
        : t("layout.push.cta");

  return (
    <Button
      size="sm"
      variant="secondary"
      isDisabled={!webPush.canSubscribe || webPush.isWorking || webPush.flowStatus === "done"}
      onPress={() => {
        void webPush.subscribe();
      }}
    >
      <BellRingIcon className="size-4" />
      {label}
    </Button>
  );
}
