/** @jest-environment jsdom */
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function PrivateCase({ viewer }: { viewer: string }) {
  const query = useQuery({
    queryKey: ["private-support-case"],
    queryFn: async () => `${viewer} private`,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return <p>{query.data ?? "Loading"}</p>;
}
it.each([false, true])(
  "isolates private query data when the viewer changes (injected client: %s)",
  async (injected) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const client = injected ? new QueryClient() : undefined;
    const render = (viewer: string) => (
      <AppConfigProvider
        config={{
          appUrl: "http://127.0.0.1",
          serverUrl: "http://127.0.0.1",
          appName: "Local cache fixture",
        }}
      >
        <AppTrpcQueryProvider queryClient={client} cacheScope={viewer}>
          <PrivateCase viewer={viewer} />
        </AppTrpcQueryProvider>
      </AppConfigProvider>
    );
    try {
      await act(async () => {
        root.render(render("Alice"));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(host.textContent).toBe("Alice private");
      await act(async () => {
        root.render(render("Bob"));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(host.textContent).toBe("Bob private");
      expect(host.textContent).not.toContain("Alice");
    } finally {
      await act(async () => root.unmount());
      host.remove();
      client?.clear();
    }
  }
);
