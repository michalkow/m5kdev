import { Button, toast } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useTranslation } from "react-i18next";

export function ImpersonationBanner() {
  const { data: session } = useSession();
  const { t } = useTranslation("web-ui");
  const isImpersonating = !!session?.session?.impersonatedBy;
  const impersonatedUserName = session?.user?.name;
  const impersonatedUserEmail = session?.user?.email;

  const onStopImpersonating = async () => {
    try {
      await authClient.admin.stopImpersonating();
      toast.success(t("web-ui:impersonating.stop.success"));
      window.location.assign("/admin");
    } catch (error) {
      toast.danger(t("web-ui:impersonating.stop.error"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!isImpersonating) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning bg-warning px-4 py-2 text-amber-900">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{t("web-ui:impersonating.message")}</span>
        {impersonatedUserName && <span className="font-medium">{impersonatedUserName}</span>}
        {impersonatedUserEmail && (
          <span className="text-amber-800/90">({impersonatedUserEmail})</span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onPress={onStopImpersonating}
        className="border-warning bg-warning text-warning-foreground hover:bg-warning/90 hover:text-warning-foreground/90"
      >
        {t("web-ui:impersonating.stop")}
      </Button>
    </div>
  );
}
