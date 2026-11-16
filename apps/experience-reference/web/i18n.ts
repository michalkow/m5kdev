import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import shared from "../node_modules/@m5kdev/web-ui/dist/translations/en/web-ui.json";

const reference = {
  refreshSubscription: "Refresh subscription",
  reportsNavigation: "Reports workspace",
  assistantNavigation: "Assistant workspace",
  bootstrap: "Loading product",
  bootstrapError: "Unable to load product",
  session: "Checking session",
  pending: "Checking access",
  error: "Unable to check access",
  denied: "Capability unavailable",
  paid: "Subscription ready",
  plans: "Choose a plan",
  publish: "Publish report",
  published: "Published",
  grantDenied: "Action denied",
  refresh: "Refresh access",
  reports: "Reports workflow",
  assistant: "Assistant workflow",
  portal: "Manage subscription",
  checkout: "Choose Reports",
  preferences: "Preferences",
  locale: "Locale",
};
export const initializeI18n = () =>
  i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { "web-ui": shared, reference }, "en-GB": { "web-ui": shared, reference } },
    interpolation: { escapeValue: false },
  });
