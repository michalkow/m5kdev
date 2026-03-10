import { Building2, ChevronsUpDown, CreditCard, LogOut, Settings, Sparkles, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "#components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "#components/ui/sidebar";

export type AppSidebarUserProps = {
  user?: {
    name: string;
    email: string;
    image?: string | null;
    role?: string | null;
  };
  onSignOut: () => void;
  organizationSettingsPath?: string;
};

export function AppSidebarUser({ user, onSignOut, organizationSettingsPath }: AppSidebarUserProps) {
  const { name = "User", email = "email@example.com", image, role } = user || {};
  const isAdmin = role === "admin";
  const { isMobile } = useSidebar();
  const { t } = useTranslation("web-ui");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={image ?? undefined} alt={name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={image ?? undefined} alt={name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Link to="/billing">
                <DropdownMenuItem className="cursor-pointer">
                  <Sparkles />
                  {t("web-ui:sidebar.user.upgradeToPro")}
                </DropdownMenuItem>
              </Link>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {isAdmin && (
                <Link to="/admin">
                  <DropdownMenuItem className="cursor-pointer">
                    <Settings />
                    {t("web-ui:sidebar.user.adminDashboard")}
                  </DropdownMenuItem>
                </Link>
              )}
              {organizationSettingsPath && (
                <Link to={organizationSettingsPath}>
                  <DropdownMenuItem className="cursor-pointer">
                    <Building2 />
                    {t("web-ui:sidebar.user.organizationSettings", {
                      defaultValue: "Organization settings",
                    })}
                  </DropdownMenuItem>
                </Link>
              )}
              <Link to="/profile">
                <DropdownMenuItem className="cursor-pointer">
                  <User />
                  {t("web-ui:sidebar.user.account")}
                </DropdownMenuItem>
              </Link>
              <Link to="/billing">
                <DropdownMenuItem className="cursor-pointer">
                  <CreditCard />
                  {t("web-ui:sidebar.user.billing")}
                </DropdownMenuItem>
              </Link>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={onSignOut}>
              <LogOut />
              {t("web-ui:sidebar.user.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
