import {
  createRoleValueSchema,
  DEFAULT_AUTH_ROLES,
  defineAuthRoles,
  getAppRoleTranslationKey,
  getRoleKeys,
  isAllowedRole,
  normalizeAuthRolesConfig,
} from "@m5kdev/commons/modules/auth/auth.roles";

describe("auth.roles", () => {
  describe("normalizeAuthRolesConfig", () => {
    it("returns defaults when config is omitted", () => {
      expect(normalizeAuthRolesConfig()).toEqual(DEFAULT_AUTH_ROLES);
      expect(normalizeAuthRolesConfig(null)).toEqual(DEFAULT_AUTH_ROLES);
    });

    it("normalizes custom organization roles with defaults for manager and assignable", () => {
      const config = defineAuthRoles({
        user: { roles: ["user", "admin"] },
        organization: {
          roles: ["member", "admin", "owner", "editor"],
          managerRoles: ["admin", "owner"],
          assignableRoles: ["member", "admin", "editor"],
          defaultRole: "member",
        },
        team: { roles: ["member", "manager", "owner"], defaultRole: "member" },
      });

      expect(getRoleKeys(config, "organization")).toEqual(["member", "admin", "owner", "editor"]);
      expect(config.organization.managerRoles).toEqual(["admin", "owner"]);
      expect(config.organization.assignableRoles).toEqual(["member", "admin", "editor"]);
      expect(config.organization.defaultRole).toBe("member");
    });

    it("filters manager and assignable roles to configured role keys", () => {
      const config = defineAuthRoles({
        user: { roles: ["user", "admin"] },
        organization: {
          roles: ["member", "editor"],
          managerRoles: ["admin", "owner"],
          assignableRoles: ["member", "admin", "editor"],
        },
        team: { roles: ["owner"] },
      });

      expect(config.organization.managerRoles).toEqual(["member"]);
      expect(config.organization.assignableRoles).toEqual(["member", "editor"]);
    });
  });

  describe("createRoleValueSchema", () => {
    it("accepts configured role keys and rejects unknown values", () => {
      const schema = createRoleValueSchema(DEFAULT_AUTH_ROLES.organization);

      expect(schema.safeParse("member").success).toBe(true);
      expect(schema.safeParse("editor").success).toBe(false);
    });
  });

  describe("isAllowedRole", () => {
    it("checks membership against normalized config", () => {
      const config = defineAuthRoles({
        user: { roles: ["user", "admin"] },
        organization: {
          roles: ["member", "editor"],
          managerRoles: ["editor"],
        },
        team: { roles: ["owner"] },
      });

      expect(isAllowedRole(config, "organization", "editor")).toBe(true);
      expect(isAllowedRole(config, "organization", "admin")).toBe(false);
    });
  });

  describe("getAppRoleTranslationKey", () => {
    it("builds app namespace translation keys", () => {
      expect(getAppRoleTranslationKey("user", "admin")).toBe("user.role.admin");
      expect(getAppRoleTranslationKey("organization", "editor")).toBe("organization.role.editor");
      expect(getAppRoleTranslationKey("team", "manager")).toBe("team.role.manager");
    });
  });
});
