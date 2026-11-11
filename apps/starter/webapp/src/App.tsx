import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import type { PostHog } from "posthog-js";
import { BrowserRouter } from "react-router";
import { Providers } from "./Providers";
import { Router } from "./Router";

export function App({ posthog }: { posthog?: PostHog }) {
  return (
    <NuqsAdapter>
      <BrowserRouter>
        <Providers posthog={posthog}>
          <Router />
        </Providers>
      </BrowserRouter>
    </NuqsAdapter>
  );
}
