import { Button, Select, SelectItem } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { useSidebar } from "#components/ui/sidebar";
import { cn } from "#utils";

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
      <Button
        as={Link}
        to={canManageOrganization ? managerPath : fallbackPath}
        variant="light"
        size="sm"
        isIconOnly
        aria-label={t("web-ui:organization.switcher.label")}
      >
        <Building2 className="h-4 w-4" />
      </Button>
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
        <Button size="sm" variant="flat" onPress={() => void refetch()}>
          {t("web-ui:organization.switcher.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <Select
        size="sm"
        label={t("web-ui:organization.switcher.label")}
        selectedKeys={activeOrganizationId ? [activeOrganizationId] : []}
        disallowEmptySelection
        isDisabled={isSwitching || organizations.length === 0}
        onSelectionChange={(keys) => {
          const selectedOrganizationId = Array.from(keys as Set<string>)[0];
          if (selectedOrganizationId) {
            void handleSwitchOrganization(selectedOrganizationId);
          }
        }}
        classNames={{
          trigger: cn("min-h-10"),
          value: cn("text-sm"),
        }}
      >
        {organizations.map((organization) => (
          <SelectItem key={organization.id}>{organization.name}</SelectItem>
        ))}
      </Select>
    </div>
  );
}
