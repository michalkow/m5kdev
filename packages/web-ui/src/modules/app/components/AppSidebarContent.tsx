import { Link } from "react-router";
import { CollapsibleSidebarMenuItem } from "../../../components/CollapsibleSidebarMenuItem";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../../../components/ui/sidebar";

type NavigationItem = {
  label: string;
  icon: React.ReactNode;
  link: string;
  badge?: React.ReactNode;
};

export type AppSidebarContentProps = {
  navigationItems: (NavigationItem & {
    defaultOpen?: boolean;
    subItems?: NavigationItem[];
  })[];
  navigationState: Record<string, boolean>;
  onNavigationStateChange: (state: Record<string, boolean>) => void;
};

export function AppSidebarContent({
  navigationItems,
  navigationState,
  onNavigationStateChange,
}: AppSidebarContentProps) {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {navigationItems.map((item) =>
          item.subItems ? (
            <CollapsibleSidebarMenuItem
              key={item.label}
              defaultOpen={item.defaultOpen}
              open={navigationState[item.label]}
              label={item.label}
              icon={item.icon}
              link={item.link}
              badge={item.badge}
              onOpenChange={(open) =>
                onNavigationStateChange({ ...navigationState, [item.label]: open })
              }
            >
              {item.subItems.map((subItem) => (
                <SidebarMenuItem key={subItem.label}>
                  <SidebarMenuButton asChild>
                    <Link to={subItem.link}>
                      {subItem.icon}
                      <span>{subItem.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </CollapsibleSidebarMenuItem>
          ) : (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton asChild>
                <Link to={item.link}>
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
