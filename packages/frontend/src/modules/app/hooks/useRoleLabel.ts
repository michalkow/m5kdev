import {
  getAppRoleTranslationKey,
  type AuthRoleScope,
} from "@m5kdev/commons/modules/auth/auth.roles";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

const ORGANIZATION_WEB_UI_FALLBACK_PREFIX = "web-ui:organization.roles.";

export function useRoleLabel(scope: AuthRoleScope): (role: string) => string {
  const { t } = useTranslation(["app", "web-ui"]);

  return useCallback(
    (role: string) => {
      const appKey = `app:${getAppRoleTranslationKey(scope, role)}`;
      const appLabel = t(appKey, { defaultValue: "" });
      if (appLabel) {
        return appLabel;
      }

      if (scope === "organization") {
        const webUiLabel = t(`${ORGANIZATION_WEB_UI_FALLBACK_PREFIX}${role}`, {
          defaultValue: "",
        });
        if (webUiLabel) {
          return webUiLabel;
        }
      }

      return role;
    },
    [scope, t]
  );
}
