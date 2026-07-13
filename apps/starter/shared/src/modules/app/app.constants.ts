import { defineAuthRoles } from "@m5kdev/commons/modules/auth/auth.roles";

export const APP_NAME = "M5 Starter";
export const APP_SLUG = "starter-app";

export const APP_LOCALE_CONFIG = {
  defaultLocale: "en",
  locales: [
    { code: "en", displayName: "English" },
    { code: "en_GB", displayName: "English (UK)" },
  ],
} as const;

export const APP_ROLES_CONFIG = defineAuthRoles({
  user: {
    roles: ["user", "admin"],
  },
  organization: {
    roles: ["member", "admin", "owner"],
    managerRoles: ["admin", "owner"],
    assignableRoles: ["member", "admin", "owner"],
    defaultRole: "member",
  },
  team: {
    roles: ["owner"],
    defaultRole: "owner",
  },
});
