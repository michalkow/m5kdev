import { defineAuthRoles } from "@m5kdev/commons/modules/auth/auth.roles";

export const APP_ROLES_CONFIG = defineAuthRoles({
  user: {
    roles: ["user", "admin"],
  },
  organization: {
    roles: ["member", "admin", "owner", "editor"],
    managerRoles: ["admin", "owner"],
    assignableRoles: ["member", "admin", "editor"],
    defaultRole: "member",
  },
  team: {
    roles: ["member", "manager", "owner"],
    managerRoles: ["manager", "owner"],
    assignableRoles: ["member", "manager"],
    defaultRole: "member",
  },
});
