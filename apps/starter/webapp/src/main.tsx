import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initBrowserPosthog } from "./utils/posthog";
import "./index.css";
import "./utils/i18n";

const posthog = initBrowserPosthog({
  apiKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
  host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App posthog={posthog} />
  </StrictMode>
);
