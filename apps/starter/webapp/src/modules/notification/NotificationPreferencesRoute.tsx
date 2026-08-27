import { Card } from "@heroui/react";
import { NotificationPreferences } from "@m5kdev/web-ui/modules/notification/components/NotificationPreferences";
import { NOTIFICATION_KINDS } from "@starter-app/shared/modules/notification/notification.constants";
import { useTranslation } from "react-i18next";
import { StarterWebPush } from "./StarterWebPush";

export function NotificationPreferencesRoute() {
  const { t } = useTranslation("starter-app");

  return (
    <div className="grid gap-6 p-4" data-testid="notification-preferences-route">
      <div className="justify-self-start">
        <StarterWebPush />
      </div>
      <Card>
        <Card.Header className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("notifications.hero.eyebrow")}
          </p>
          <Card.Title>{t("notifications.hero.title")}</Card.Title>
          <Card.Description>{t("notifications.hero.body")}</Card.Description>
        </Card.Header>
        <Card.Content>
          <NotificationPreferences kinds={NOTIFICATION_KINDS} offerEmail />
        </Card.Content>
      </Card>
    </div>
  );
}
