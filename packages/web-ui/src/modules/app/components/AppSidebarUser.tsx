import { Avatar, Dropdown, Separator } from "@heroui/react";
import {
  Building2,
  ChevronsUpDown,
  CreditCard,
  LogOut,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../../../components/Sidebar";

export interface AppSidebarUserProps {
  user?: {
    name: string;
    email: string;
    image?: string | null;
    role?: string | null;
  };
  onSignOut: () => void;
  organizationSettingsPath?: string;
}

function getUserInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "U";
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.charAt(0) ?? "";
    const last = parts[parts.length - 1]?.charAt(0) ?? "";
    return `${first}${last}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function AppSidebarUser({ user, onSignOut, organizationSettingsPath }: AppSidebarUserProps) {
  const { name = "User", email = "email@example.com", image, role } = user || {};
  const initials = getUserInitials(name);
  const isAdmin = role === "admin";
  const { isMobile } = useSidebar();
  const { t } = useTranslation("web-ui");
  const navigate = useNavigate();
  const menuInstanceId = useId();

  const menuLabel = t("web-ui:sidebar.user.account", { defaultValue: "User menu" });
  const itemId = (suffix: string): string => `${menuInstanceId}-${suffix}`;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Dropdown>
          <Dropdown.Trigger className="w-full">
            <SidebarMenuButton size="lg" className="w-full" aria-label={menuLabel}>
              <Avatar size="sm" className="shrink-0 rounded-lg">
                {image ? <Avatar.Image src={image} alt={name} /> : null}
                <Avatar.Fallback className="rounded-lg">{initials}</Avatar.Fallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-surface-foreground">{name}</span>
                <span className="truncate text-xs text-default-600">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 text-default-500" />
            </SidebarMenuButton>
          </Dropdown.Trigger>
          <Dropdown.Popover
            placement={isMobile ? "bottom end" : "right bottom"}
            className="min-w-56 p-0"
            offset={16}
          >
            <div className="flex items-center gap-2 border-b border-default-200 px-3 py-2">
              <Avatar size="sm" className="shrink-0 rounded-lg">
                {image ? <Avatar.Image src={image} alt={name} /> : null}
                <Avatar.Fallback className="rounded-lg">{initials}</Avatar.Fallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-foreground">{name}</span>
                <span className="truncate text-xs text-default-600">{email}</span>
              </div>
            </div>
            <Dropdown.Menu aria-label={menuLabel}>
              <Dropdown.Item
                key="upgrade"
                id={itemId("upgrade")}
                textValue={t("web-ui:sidebar.user.upgradeToPro")}
                onPress={() => navigate("/billing")}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="size-4 shrink-0" />
                  {t("web-ui:sidebar.user.upgradeToPro")}
                </span>
              </Dropdown.Item>
              <Separator className="my-1" />
              {isAdmin ? (
                <Dropdown.Item
                  key="admin"
                  id={itemId("admin")}
                  textValue={t("web-ui:sidebar.user.adminDashboard")}
                  onPress={() => navigate("/admin")}
                >
                  <span className="flex items-center gap-2">
                    <Settings className="size-4 shrink-0" />
                    {t("web-ui:sidebar.user.adminDashboard")}
                  </span>
                </Dropdown.Item>
              ) : null}
              {organizationSettingsPath ? (
                <Dropdown.Item
                  key="organization"
                  id={itemId("organization")}
                  textValue={t("web-ui:sidebar.user.organizationSettings", {
                    defaultValue: "Organization settings",
                  })}
                  onPress={() => navigate(organizationSettingsPath)}
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="size-4 shrink-0" />
                    {t("web-ui:sidebar.user.organizationSettings", {
                      defaultValue: "Organization settings",
                    })}
                  </span>
                </Dropdown.Item>
              ) : null}
              <Dropdown.Item
                key="profile"
                id={itemId("profile")}
                textValue={t("web-ui:sidebar.user.account")}
                onPress={() => navigate("/profile")}
              >
                <span className="flex items-center gap-2">
                  <User className="size-4 shrink-0" />
                  {t("web-ui:sidebar.user.account")}
                </span>
              </Dropdown.Item>
              <Dropdown.Item
                key="billing"
                id={itemId("billing")}
                textValue={t("web-ui:sidebar.user.billing")}
                onPress={() => navigate("/billing")}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="size-4 shrink-0" />
                  {t("web-ui:sidebar.user.billing")}
                </span>
              </Dropdown.Item>
              <Separator className="my-1" />
              <Dropdown.Item
                key="logout"
                id={itemId("logout")}
                textValue={t("web-ui:sidebar.user.logout")}
                variant="danger"
                onPress={onSignOut}
              >
                <span className="flex items-center gap-2">
                  <LogOut className="size-4 shrink-0" />
                  {t("web-ui:sidebar.user.logout")}
                </span>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
