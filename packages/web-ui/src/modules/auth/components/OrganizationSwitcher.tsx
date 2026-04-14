import { Button, Label, ListBox, Select } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { useSidebar } from "../../../components/ui/sidebar";
import { cn } from "../../../lib/utils";

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationSwitcherProps = {
  onInvalidateScopedQueries?: () => void | Promise<void>;
  managerRoles?: string[];
  managerPath?: string;
  fallbackPath?: string;
};

export function OrganizationSwitcher({
  onInvalidateScopedQueries,
  managerRoles = ["admin", "owner"],
  managerPath = "/organization/members",
  fallbackPath = "/",
}: OrganizationSwitcherProps) {
  const { t } = useTranslation();
  const { data: session, registerSession } = useSession();
  const { open } = useSidebar();
  const [isSwitching, setIsSwitching] = useState(false);
  const activeOrganizationId = session?.session.activeOrganizationId ?? null;
  const activeOrganizationRole =
    (session?.session as { activeOrganizationRole?: string } | undefined)?.activeOrganizationRole ??
    "";
  const managerRoleSet = useMemo(() => new Set(managerRoles), [managerRoles]);
  const canManageOrganization = managerRoleSet.has(activeOrganizationRole);

  const {
    data: organizations = [],
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["auth-organization-list"],
    queryFn: async () => {
      const { data, error } = await authClient.organization.list();
      if (error) {
        throw new Error(
          error.message ?? t("web-ui:organization.switcher.failedToLoadOrganizations")
        );
      }
      return (data ?? []) as OrganizationOption[];
    },
  });

  const handleSwitchOrganization = useCallback(
    async (organizationId: string) => {
      if (!organizationId || organizationId === activeOrganizationId || isSwitching) {
        return;
      }

      try {
        setIsSwitching(true);
        const { error } = await authClient.organization.setActive({ organizationId });
        if (error) {
          throw new Error(
            error.message ?? t("web-ui:organization.switcher.failedToSwitchOrganization")
          );
        }

        registerSession(() => {
          void onInvalidateScopedQueries?.();
        });
        toast.success(t("web-ui:organization.switcher.organizationSwitched"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("web-ui:organization.switcher.failedToSwitchOrganization")
        );
      } finally {
        setIsSwitching(false);
      }
    },
    [activeOrganizationId, isSwitching, onInvalidateScopedQueries, registerSession, t]
  );

  if (!open) {
    return (
      <Link
        to={canManageOrganization ? managerPath : fallbackPath}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md text-sm font-medium",
          "text-default-600 transition-colors hover:bg-default-100"
        )}
        aria-label={t("web-ui:organization.switcher.label")}
      >
        <Building2 className="h-4 w-4" />
      </Link>
    );
  }

  if (isError) {
    return (
      <div className="mb-4 flex flex-col gap-2">
        <p className="text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : t("web-ui:organization.switcher.failedToLoadOrganizations")}
        </p>
        <Button size="sm" variant="secondary" onPress={() => void refetch()}>
          {t("web-ui:organization.switcher.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4 grid gap-2">
      <Label className="text-sm font-medium">{t("web-ui:organization.switcher.label")}</Label>
      <Select
        className="min-h-10"
        selectedKey={activeOrganizationId ?? undefined}
        isDisabled={isSwitching || organizations.length === 0}
        onSelectionChange={(key) => {
          const selectedOrganizationId = key == null ? undefined : String(key);
          if (selectedOrganizationId) {
            void handleSwitchOrganization(selectedOrganizationId);
          }
        }}
      >
        <Select.Trigger className="min-h-10">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {organizations.map((organization) => (
              <ListBox.Item
                key={organization.id}
                id={organization.id}
                textValue={organization.name}
              >
                {organization.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
