import type { TFunction } from "i18next";
import {
  BookTextIcon,
  Building2Icon,
  GiftIcon,
  SettingsIcon,
  ShieldCheckIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";

/** Single source of truth for app paths — used by the Router and the sidebar. */
export const APP_ROUTES = {
  home: "/",
  posts: "/posts",
  organization: {
    members: "/organization/members",
    manage: "/organization/manage",
    preferences: "/organization/preferences",
  },
  user: {
    preferences: "/user/preferences",
    invite: "/user/invite",
  },
  admin: "/admin/users",
  billing: "/billing",
} as const;

/**
 * Sidebar navigation for AppSidebarContent: top-level items plus collapsible
 * groups. Labels are translated by the caller so the config stays a plain list.
 */
export function buildNavigationItems(t: TFunction) {
  return [
    {
      label: t("layout.navigation.posts"),
      icon: <BookTextIcon className="h-4 w-4" />,
      link: APP_ROUTES.posts,
    },
    {
      label: t("layout.navigation.organization"),
      icon: <Building2Icon className="h-4 w-4" />,
      link: APP_ROUTES.organization.members,
      subItems: [
        {
          label: t("layout.navigation.members"),
          icon: <UsersIcon className="h-4 w-4" />,
          link: APP_ROUTES.organization.members,
        },
        {
          label: t("layout.navigation.childOrgs"),
          icon: <Building2Icon className="h-4 w-4" />,
          link: APP_ROUTES.organization.manage,
        },
        {
          label: t("layout.navigation.orgPreferences"),
          icon: <SettingsIcon className="h-4 w-4" />,
          link: APP_ROUTES.organization.preferences,
        },
      ],
    },
    {
      label: t("layout.navigation.account"),
      icon: <UserCogIcon className="h-4 w-4" />,
      link: APP_ROUTES.user.preferences,
      subItems: [
        {
          label: t("layout.navigation.profile"),
          icon: <UserCogIcon className="h-4 w-4" />,
          link: APP_ROUTES.user.preferences,
        },
        {
          label: t("layout.navigation.invites"),
          icon: <GiftIcon className="h-4 w-4" />,
          link: APP_ROUTES.user.invite,
        },
      ],
    },
    {
      label: t("layout.navigation.admin"),
      icon: <ShieldCheckIcon className="h-4 w-4" />,
      link: APP_ROUTES.admin,
    },
  ];
}
