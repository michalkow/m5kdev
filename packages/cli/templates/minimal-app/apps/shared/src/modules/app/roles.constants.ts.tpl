import { defineAuthRoles } from "@m5kdev/commons/modules/auth/auth.roles";

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
