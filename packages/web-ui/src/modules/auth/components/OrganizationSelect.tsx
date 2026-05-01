import { ListBox, Select, type SelectProps } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useUserOrganizations } from "@m5kdev/frontend/modules/auth/hooks/useUserOrganizations";

export function OrganizationSelect<T extends object>(props: SelectProps<T, "single">) {
  const { data: session } = useSession();
  const { data: organizations = [] } = useUserOrganizations();
  return (
    <Select
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
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {organizations.map((organization) => (
            <ListBox.Item key={organization.id} id={organization.id} textValue={organization.name}>
              {organization.name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
