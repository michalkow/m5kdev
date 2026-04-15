import type { Preview } from "@storybook/react";
import i18n from "i18next";
import { createElement, type PropsWithChildren, type ReactNode, useEffect } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";

import webUiEn from "../translations/en/web-ui.json";
import "./preview.css";

interface StorybookHtmlThemeProps {
  readonly isDark: boolean;
}

function StorybookHtmlTheme({
  isDark,
  children,
}: PropsWithChildren<StorybookHtmlThemeProps>): ReactNode {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  return children ?? null;
}

const storybookI18n = i18n.createInstance();

void storybookI18n.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  ns: ["web-ui"],
  defaultNS: "web-ui",
  resources: {
    en: {
      "web-ui": webUiEn,
    },
  },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Light or dark appearance (toggles `dark` on `<html>`)",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const isDark = context.globals.theme === "dark";
      return createElement(
        StorybookHtmlTheme,
        { isDark },
        createElement(
          I18nextProvider,
          { i18n: storybookI18n },
          createElement(
            "div",
            { className: "min-h-screen bg-canvas text-ink" },
            createElement(Story)
          )
        )
      );
    },
  ],
};

export default preview;
