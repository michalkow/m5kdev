import {
  type AuthLocaleConfig,
  resolveAppLocale,
  toI18nLanguageTag,
} from "@m5kdev/commons/modules/auth/auth.locale";
import { createAppI18n } from "./app-i18n";

const localeConfig: AuthLocaleConfig = {
  defaultLocale: "en",
  locales: [
    { code: "en", displayName: "English" },
    { code: "en_GB", displayName: "English (UK)" },
  ],
};

describe("app-i18n", () => {
  it("falls back from en_GB to en when only en has translations", () => {
    const appI18n = createAppI18n(localeConfig, {
      en: {
        translation: {
          verification: {
            subject: "Verify your email",
          },
        },
      },
    });

    expect(appI18n.t("en_GB", "verification.subject")).toBe("Verify your email");
  });

  it("uses en_GB translations when present", () => {
    const appI18n = createAppI18n(localeConfig, {
      en: {
        translation: {
          organizationInvite: {
            action: "Accept organization invite",
          },
        },
      },
      en_GB: {
        translation: {
          organizationInvite: {
            action: "Accept organisation invite",
          },
        },
      },
    });

    expect(appI18n.t("en_GB", "organizationInvite.action")).toBe("Accept organisation invite");
  });

  it("maps canonical locale tags to i18next language tags in getFixedT", () => {
    const appI18n = createAppI18n(localeConfig, {
      en_GB: {
        translation: {
          greeting: "Hello",
        },
      },
    });

    const t = appI18n.getFixedT("en_GB");
    expect(t("greeting")).toBe("Hello");
    expect(toI18nLanguageTag("en_GB")).toBe("en-GB");
  });

  it("defaults missing locale input to configured defaultLocale", () => {
    const appI18n = createAppI18n(localeConfig, {
      en: {
        translation: {
          greeting: "Hello",
        },
      },
    });

    expect(appI18n.defaultLocale).toBe(resolveAppLocale(null, localeConfig));
    expect(appI18n.t(undefined, "greeting")).toBe("Hello");
  });
});
