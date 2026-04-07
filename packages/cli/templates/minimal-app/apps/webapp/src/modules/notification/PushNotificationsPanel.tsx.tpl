import { Button, Chip } from "@heroui/react";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useWebPush } from "@m5kdev/web-ui/hooks/useWebPush";
import { BellIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTRPC } from "../../utils/trpc";

export function PushNotificationsPanel() {
  const { data: session } = useSession();
  const trpc = useTRPC();
  const { t } = useTranslation("blog-app");

  const messages = useMemo(
    () => ({
      unsupported: t("layout.push.unsupported"),
      denied: t("layout.push.denied"),
      noVapid: t("layout.push.noVapid"),
      badSubscription: t("layout.push.badSubscription"),
      failed: t("layout.push.failed"),
      enabled: t("layout.push.enabled"),
    }),
    [t],
  );

  const {
    permission,
    isSupported,
    subscribe,
    flowStatus,
    feedback,
    isWorking,
    canSubscribe,
    vapidError,
    isVapidLoading,
  } = useWebPush({
    enabled: Boolean(session),
    messages,
    vapidPublicKeyQuery: trpc.notification.vapidPublicKey.queryOptions(),
    registerDeviceMutation: trpc.notification.registerDevice.mutationOptions(),
  });

  if (!session) {
    return null;
  }

  const disabled = isVapidLoading || vapidError || isWorking || !canSubscribe;
  const blocked = permission === "denied";

  return (
    <div className="mt-6 rounded-[28px] border border-sky-200/80 bg-sky-50/90 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-sky-200 bg-white/90 p-2 text-sky-700">
          <BellIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-sky-800/80">
            {t("layout.push.eyebrow")}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink/80">{t("layout.push.body")}</p>
          {!isSupported ? (
            <p className="mt-2 text-xs text-rose-700">{t("layout.push.unsupported")}</p>
          ) : null}
          {blocked ? (
            <p className="mt-2 text-xs text-rose-700">{t("layout.push.blockedHint")}</p>
          ) : null}
          {vapidError ? (
            <p className="mt-2 text-xs text-rose-700">{t("layout.push.vapidMissing")}</p>
          ) : null}
          {permission === "granted" && flowStatus === "idle" && !vapidError ? (
            <p className="mt-2 text-xs text-emerald-800/90">{t("layout.push.permissionGranted")}</p>
          ) : null}
          {feedback ? (
            <Chip className="mt-3" color={flowStatus === "error" ? "danger" : "success"} variant="flat">
              {feedback}
            </Chip>
          ) : null}
          <Button
            className="mt-3"
            color="primary"
            isDisabled={disabled}
            radius="full"
            size="sm"
            variant="flat"
            onPress={() => void subscribe()}
          >
            {t("layout.push.cta")}
          </Button>
        </div>
      </div>
    </div>
  );
}
