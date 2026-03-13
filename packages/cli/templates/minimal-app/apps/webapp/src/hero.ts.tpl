import { heroui } from "@heroui/react";

export default heroui({
  themes: {
    light: {
      colors: {
        primary: {
          "50": "#edf7f4",
          "100": "#cfeadd",
          "200": "#adddc5",
          "300": "#88cfac",
          "400": "#61c091",
          "500": "#1f4f46",
          "600": "#19433b",
          "700": "#12362f",
          "800": "#0c2923",
          "900": "#051a16",
          DEFAULT: "#1f4f46",
          foreground: "#fff8ef",
        },
        secondary: {
          "50": "#fff4e5",
          "100": "#fce2bd",
          "200": "#f8cf95",
          "300": "#f4bc6d",
          "400": "#efaa45",
          "500": "#c7782d",
          "600": "#a16024",
          "700": "#7b491b",
          "800": "#553112",
          "900": "#301a09",
          DEFAULT: "#c7782d",
          foreground: "#fff9f2",
        },
        background: "#f4ede2",
        foreground: "#171314",
        content1: {
          DEFAULT: "#fffaf1",
          foreground: "#171314",
        },
        content2: {
          DEFAULT: "#f4ede2",
          foreground: "#171314",
        },
        focus: "#1f4f46",
      },
    },
    dark: {
      colors: {
        primary: {
          "50": "#e2f3ef",
          "100": "#beded7",
          "200": "#98c8bc",
          "300": "#71b2a1",
          "400": "#4b9c86",
          "500": "#2d8470",
          "600": "#236959",
          "700": "#194e42",
          "800": "#10332b",
          "900": "#061815",
          DEFAULT: "#71b2a1",
          foreground: "#071613",
        },
        secondary: {
          "50": "#fff4e5",
          "100": "#f6dcb0",
          "200": "#eec379",
          "300": "#e6aa42",
          "400": "#d88d27",
          "500": "#b97221",
          "600": "#935a1b",
          "700": "#6d4214",
          "800": "#472b0d",
          "900": "#231406",
          DEFAULT: "#e6aa42",
          foreground: "#211306",
        },
        background: "#12100f",
        foreground: "#f7f1e8",
        content1: {
          DEFAULT: "#1d1917",
          foreground: "#f7f1e8",
        },
        content2: {
          DEFAULT: "#26211f",
          foreground: "#f7f1e8",
        },
        focus: "#71b2a1",
      },
    },
  },
  layout: {
    radius: {
      small: "18px",
      medium: "24px",
      large: "32px",
    },
  },
});
