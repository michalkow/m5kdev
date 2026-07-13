// @ts-expect-error-next-line: virtual module
import resources from "virtual:i18next-loader";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  debug: import.meta.env.MODE === "development",
  interpolation: {
    escapeValue: false,
  },
  resources,
});
