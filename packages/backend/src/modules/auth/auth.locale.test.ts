import {
  type AuthLocaleConfig,
  resolveAppLocale,
  toCanonicalLocale,
  toI18nLanguageTag,
} from "@m5kdev/commons/modules/auth/auth.locale";

const TEST_LOCALE_CONFIG: AuthLocaleConfig = {
  defaultLocale: "en",
  locales: [
    { code: "en", displayName: "English" },
    { code: "en_GB", displayName: "English (UK)" },
  ],
};

const TEST_ALLOWED_LOCALES = ["en", "en_GB"] as const;

describe("auth.locale", () => {
  describe("toCanonicalLocale", () => {
    it("maps en-GB and en_GB to en_GB when both en and en_GB are allowed", () => {
      expect(toCanonicalLocale("en-GB", TEST_ALLOWED_LOCALES)).toBe("en_GB");
      expect(toCanonicalLocale("en_GB", TEST_ALLOWED_LOCALES)).toBe("en_GB");
      expect(toCanonicalLocale("en-gb", TEST_ALLOWED_LOCALES)).toBe("en_GB");
    });

    it("maps en to en without upgrading to en_GB", () => {
      expect(toCanonicalLocale("en", TEST_ALLOWED_LOCALES)).toBe("en");
    });

    it("maps en-US to en when only en and en_GB are allowed", () => {
      expect(toCanonicalLocale("en-US", TEST_ALLOWED_LOCALES)).toBe("en");
    });

    it("returns null for invalid locales", () => {
      expect(toCanonicalLocale("pl", TEST_ALLOWED_LOCALES)).toBeNull();
    });
  });

  describe("resolveAppLocale", () => {
    it("falls back to defaultLocale for missing or invalid input", () => {
      expect(resolveAppLocale(null, TEST_LOCALE_CONFIG)).toBe("en");
      expect(resolveAppLocale("pl", TEST_LOCALE_CONFIG)).toBe("en");
    });

    it("resolves valid browser tags to canonical values", () => {
      expect(resolveAppLocale("en-GB", TEST_LOCALE_CONFIG)).toBe("en_GB");
      expect(resolveAppLocale("en", TEST_LOCALE_CONFIG)).toBe("en");
    });
  });

  describe("toI18nLanguageTag", () => {
    it("maps underscore canonical tags to i18next BCP 47 tags", () => {
      expect(toI18nLanguageTag("en_GB")).toBe("en-GB");
      expect(toI18nLanguageTag("en")).toBe("en");
    });
  });
});
