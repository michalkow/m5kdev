/** @jest-environment jsdom */

import { useSupport } from "@m5kdev/frontend/modules/support/hooks/useSupport";
import { useSupportWidget } from "@m5kdev/frontend/modules/support/hooks/useSupportWidget";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const requests: { operation: string; input: Record<string, unknown> }[] = [];
let readsFail = true;
let documentationFails = true;
let readGate: Promise<void> = Promise.resolve();
let writesFail = true;
let settingsCalls = 0;
let docsCalls = 0;
let language = "en";
let unreadTotal = 1;
let badge = 0;
let widgetOpen = false;
let widgetClosed = 0;
const operation = (name: string) => ({
  queryOptions: (input: unknown, options = {}) => ({
    ...options,
    queryKey: [name, input],
    queryFn: async () => {
      if (name === "getSettings") {
        await readGate;
        settingsCalls++;
        if (readsFail) throw new Error("Settings unavailable");
        return { version: 1 };
      }
      if (name === "getDocumentation") {
        await readGate;
        docsCalls++;
        if (documentationFails) throw new Error("Documentation unavailable");
        return [];
      }
      if (name === "getUnreadCount") return { count: unreadTotal };
      if (name === "getCase")
        return {
          messages: [{ id: "viewed", sequence: 3, publishedAt: new Date() }],
          case: { id: "case", version: 1 },
        };
      return {};
    },
  }),
  infiniteQueryOptions: (input: unknown, options = {}) => ({
    ...options,
    queryKey: [name, input],
    initialPageParam: undefined,
    queryFn: async () => ({ items: [], cursor: null }),
  }),
  queryFilter: () => ({ queryKey: [name] }),
  infiniteQueryFilter: () => ({ queryKey: [name] }),
  mutationOptions: (options = {}) => ({
    ...options,
    mutationFn: async (input: Record<string, unknown>) => {
      requests.push({ operation: name, input });
      if (writesFail) throw new Error("Response lost");
      if (name === "markRead") unreadTotal = 0;
      return { id: "created" };
    },
  }),
});
const support = new Proxy({}, { get: (_target, name) => operation(String(name)) });
jest.mock("@m5kdev/frontend/modules/app/hooks/useAppTrpc", () => ({
  useAppTRPC: () => ({ support }),
}));
jest.mock("@m5kdev/frontend/modules/app/hooks/useServerEventHandler", () => ({
  useServerEventHandler: () => {},
}));
jest.mock("@m5kdev/frontend/modules/auth/hooks/useSession", () => ({
  useSession: () => ({ data: { user: { id: "viewer" } } }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      get resolvedLanguage() {
        return language;
      },
      get language() {
        return language;
      },
    },
  }),
}));
jest.mock("nuqs", () => ({
  parseAsString: { withDefault: () => ({}) },
  useQueryStates: () => [
    { q: "", status: "", priority: "", waitingOn: "", assignee: "", supportSince: "" },
    () => {},
  ],
}));
let state: ReturnType<typeof useSupport>;
function Harness() {
  state = useSupport(true);
  badge = useSupportWidget({
    isOpen: widgetOpen,
    onClose: () => {
      widgetClosed++;
    },
  }).unreadCount;
  return null;
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
async function mount() {
  const host = document.createElement("div");
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    )
  );
  await settle();
  return async () => {
    await act(async () => root.unmount());
    client.clear();
  };
}
beforeEach(() => {
  requests.length = 0;
  readsFail = true;
  documentationFails = true;
  readGate = Promise.resolve();
  writesFail = true;
  settingsCalls = 0;
  docsCalls = 0;
  language = "en";
  unreadTotal = 1;
  widgetOpen = false;
  widgetClosed = 0;
});
it("exposes failed settings and documentation reads and refetches both on Retry", async () => {
  const dispose = await mount();
  try {
    expect(state.error).toBe("Settings unavailable");
    readsFail = false;
    await act(async () => {
      await state.retry();
    });
    await settle();
    expect(settingsCalls).toBe(2);
    expect(docsCalls).toBe(2);
    expect(state.settings).toEqual({ version: 1 });
    expect(state.error).toBe("Documentation unavailable");
    documentationFails = false;
    await act(async () => {
      await state.retry();
    });
    await settle();
    expect(docsCalls).toBe(3);
    expect(settingsCalls).toBe(2);
    expect(state.documentation).toEqual([]);
    expect(state.error).toBeUndefined();
    expect(state.documentation).toEqual([]);
    expect(state.error).toBeUndefined();
  } finally {
    await dispose();
  }
});
it("retains each failed operation identity and retries its exact semantic payload", async () => {
  const dispose = await mount();
  try {
    for (const subject of ["A", "B", "A"])
      await act(async () => {
        await state.createCase(subject, "Body");
      });
    expect(requests[0].input.clientId).toBe(requests[2].input.clientId);
    expect(requests[1].input.clientId).not.toBe(requests[0].input.clientId);
    language = "pl";
    await act(async () => {
      await state.createCase("A", "Body");
    });
    expect(requests[3].input.clientId).not.toBe(requests[0].input.clientId);
    await act(async () => state.selectCase("case"));
    await act(async () => {
      await state.sendMessage("Answer", "public", false);
    });
    await act(async () => {
      await state.sendMessage("Answer", "public", true);
    });
    expect(requests[4].input.clientId).not.toBe(requests[5].input.clientId);
    const original = requests[5].input;
    writesFail = false;
    await act(async () => {
      await state.retry();
    });
    expect(
      requests.some(
        (request, index) => index > 5 && JSON.stringify(request.input) === JSON.stringify(original)
      )
    ).toBe(true);
  } finally {
    await dispose();
  }
});

it("keeps settings and documentation loading visible until both reads finish", async () => {
  let release = () => {};
  readGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  readsFail = false;
  documentationFails = false;
  const dispose = await mount();
  try {
    expect(state.isLoading).toBe(true);
    expect(state.isSettingsLoading).toBe(true);
    expect(state.isDocumentationLoading).toBe(true);
    release();
    await settle();
    expect(state.isLoading).toBe(false);
  } finally {
    release();
    await dispose();
  }
});

it("acknowledges only the viewed published IDs and refreshes the widget badge immediately", async () => {
  readsFail = false;
  documentationFails = false;
  writesFail = false;
  const dispose = await mount();
  try {
    expect(badge).toBe(1);
    await act(async () => state.selectCase("case"));
    await settle();
    await act(async () => state.markRead());
    await settle();
    expect(requests.at(-1)).toEqual({
      operation: "markRead",
      input: { id: "case", throughSequence: 3, messageIds: ["viewed"] },
    });
    expect(badge).toBe(0);
  } finally {
    await dispose();
  }
});

it("closes an open widget with Escape after focus leaves a pending control and removes its listener on unmount", async () => {
  widgetOpen = true;
  const dispose = await mount();
  const consumed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  consumed.preventDefault();
  document.body.dispatchEvent(consumed);
  expect(widgetClosed).toBe(0);
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(widgetClosed).toBe(1);
  await dispose();
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(widgetClosed).toBe(1);
});
