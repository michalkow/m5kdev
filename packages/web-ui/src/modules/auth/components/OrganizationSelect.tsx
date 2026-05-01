import {
  Avatar,
  Description,
  Label,
  ListBox,
  Select,
  type SelectProps,
  Spinner,
} from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useUserOrganizations } from "@m5kdev/frontend/modules/auth/hooks/useUserOrganizations";
import { Building2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

type OrganizationSelectProps<T extends object> = SelectProps<T, "single"> & {
  showLoading?: boolean;
  showSingle?: boolean;
};

export function OrganizationSelect<T extends object>({
  isDisabled,
  showLoading = false,
  showSingle = false,
  ...props
}: OrganizationSelectProps<T>) {
  const { t } = useTranslation("web-ui");
  const { data: session, isLoading: isLoadingSession } = useSession();
  const { data: organizations = [], isLoading: isLoadingOrganizations } = useUserOrganizations();
  const isLoading = isLoadingSession || isLoadingOrganizations;
  if (!showLoading && isLoading) return null;
  if (!showSingle && organizations.length > 2) return null;
  return (
    <Select
      isDisabled={isLoading || isDisabled}
      {...props}
      value={session?.session.activeOrganizationId ?? undefined}
      onChange={(value) => {
        if (value) {
          authClient.organization.setActive({ organizationId: value as string }).then(() => {
            window.location.replace("/");
          });
        }
      }}
    >
      <Select.Trigger>
        {isLoading ? (
          <div className="flex flex-row items-center gap-2">
            <Spinner size="lg" />
            {t("web-ui:common.loading", { defaultValue: "Loading..." })}
          </div>
        ) : (
          <Select.Value />
        )}
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {organizations.map((organization) => (
            <ListBox.Item key={organization.id} id={organization.id} textValue={organization.name}>
              <div className="flex flex-row items-center gap-3">
                <Avatar size="sm" color="accent" variant="soft">
                  <Avatar.Image alt={organization.name} src={organization.logo ?? undefined} />
                  <Avatar.Fallback>
                    <Building2Icon size={16} />
                  </Avatar.Fallback>
                </Avatar>
                <div className="flex flex-col">
                  <Label>{organization.name}</Label>
                  <Description className="p-0">{organization.type}</Description>
                </div>
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
