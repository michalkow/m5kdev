import { EmptyState, Label, Spinner, Switch } from "@heroui/react";
import type {
  NotificationChannel,
  NotificationKind,
} from "@m5kdev/commons/modules/notification/notification.constants";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useNotificationPreferences } from "@m5kdev/frontend/modules/notification/hooks/useNotificationPreferences";
import { useTranslation } from "react-i18next";

export interface NotificationPreferencesProps {
  readonly kinds: readonly NotificationKind[];
  /** When false, the email Channel is not shown even if a kind lists it. */
  readonly offerEmail: boolean;
}

const CHANNEL_I18N: Record<NotificationChannel, string> = {
  "in-app": "notification.channel.inApp",
  "web-push": "notification.channel.webPush",
  "mobile-push": "notification.channel.mobilePush",
  email: "notification.channel.email",
};

function channelsForKind(params: {
  readonly kind: NotificationKind;
  readonly offerEmail: boolean;
}): readonly NotificationChannel[] {
  return params.kind.defaultChannels.filter((channel) => channel !== "email" || params.offerEmail);
}

function isChannelEnabled(params: {
  readonly preferences: readonly {
    readonly kind: string;
    readonly channels: readonly {
      readonly channel: NotificationChannel;
      readonly enabled: boolean;
    }[];
  }[];
  readonly kindId: string;
  readonly channel: NotificationChannel;
}): boolean {
  const row = params.preferences.find((item) => item.kind === params.kindId);
  const channel = row?.channels.find((item) => item.channel === params.channel);
  return channel?.enabled ?? true;
}

export function NotificationPreferences({ kinds, offerEmail }: NotificationPreferencesProps) {
  const { t } = useTranslation("web-ui");
  const { data: session } = useSession();
  const { preferences, isLoading, setPreference, isSaving } = useNotificationPreferences();
  const hasOrganization = Boolean(session?.session.activeOrganizationId);
  const rows = kinds
    .map((kind) => ({ kind, channels: channelsForKind({ kind, offerEmail }) }))
    .filter((row) => row.channels.length > 0);

  if (!hasOrganization) {
    return (
      <EmptyState className="px-3 py-8 text-center">
        <span className="text-sm text-default-500">
          {t("notification.preferences.noOrganization")}
        </span>
      </EmptyState>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState className="px-3 py-8 text-center">
        <span className="text-sm text-default-500">{t("notification.preferences.empty")}</span>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {rows.map(({ kind, channels }) => (
        <section key={kind.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">{kind.id}</h2>
          <ul className="flex flex-col gap-2">
            {channels.map((channel) => {
              const enabled = isChannelEnabled({
                preferences,
                kindId: kind.id,
                channel,
              });
              return (
                <li key={channel}>
                  <Switch
                    isSelected={enabled}
                    isDisabled={isSaving}
                    onChange={(next) => {
                      setPreference({ kind: kind.id, channel, enabled: next });
                    }}
                  >
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <Switch.Content>
                      <Label className="text-sm">{t(CHANNEL_I18N[channel])}</Label>
                    </Switch.Content>
                  </Switch>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
