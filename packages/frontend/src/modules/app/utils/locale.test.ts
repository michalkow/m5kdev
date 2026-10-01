import i18n from "i18next";
import { syncAuthenticatedLocale, syncI18nLocale } from "./locale";

async function ensureI18n(): Promise<void> {
  if (!i18n.isInitialized) {
    await i18n.init({
      lng: "en",
      fallbackLng: "en",
      resources: {
        en: { translation: { hello: "Hello" } },
        pl: { translation: { hello: "Cześć" } },
        "en-GB": { translation: { hello: "Hello UK" } },
      },
    });
    return;
  }
  await i18n.changeLanguage("en");
}

describe("syncI18nLocale", () => {
  beforeEach(async () => {
    await ensureI18n();
  });

  it("changes i18n language from a canonical locale code", async () => {
    await syncI18nLocale("pl");
    expect(i18n.language).toBe("pl");
  });

  it("maps underscored canonical locales to BCP 47 tags", async () => {
    await syncI18nLocale("en_GB");
    expect(i18n.language).toBe("en-GB");
  });

  it("is overwritten when a stale session locale is applied afterwards", async () => {
    await syncI18nLocale("pl");
    expect(i18n.language).toBe("pl");

    await syncI18nLocale("en");
    expect(i18n.language).toBe("en");
  });
});

describe("syncAuthenticatedLocale", () => {
  beforeEach(async () => {
    await ensureI18n();
  });

  it("syncs i18n then refreshes the session so cookie cache cannot keep the previous locale", async () => {
    const order: string[] = [];
    const refreshSession = jest.fn(async () => {
      order.push("refresh");
    });

    await syncAuthenticatedLocale("pl", refreshSession);

    expect(i18n.language).toBe("pl");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["refresh"]);
  });
});
