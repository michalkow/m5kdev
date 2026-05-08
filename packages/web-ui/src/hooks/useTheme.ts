import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getTheme(): Theme {
  if (typeof document === "undefined") return "system";

  const saved = localStorage.getItem("theme");

  if (saved === "light" || saved === "dark" || saved === "system") {
    return saved;
  }

  return "system";
}

function getResolvedTheme(): ResolvedTheme {
  const theme = getTheme();

  if (theme === "system") {
    return resolveSystemTheme();
  }

  return theme;
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.setAttribute("data-theme", resolvedTheme);
  root.style.colorScheme = resolvedTheme;
}

export function setTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  try {
    localStorage.setItem("theme", theme);
  } catch {}

  applyResolvedTheme(theme === "system" ? resolveSystemTheme() : theme);
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const root = document.documentElement;

  const observer = new MutationObserver(callback);

  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", callback);
  };
}

export function useTheme(): {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
} {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system") as Theme;
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getResolvedTheme,
    () => "light"
  ) as ResolvedTheme;

  const updateTheme = useCallback((nextTheme: Theme) => {
    setTheme(nextTheme);
  }, []);

  return {
    theme,
    resolvedTheme,
    setTheme: updateTheme,
  };
}
