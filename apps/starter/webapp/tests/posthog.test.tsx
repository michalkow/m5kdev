import i18n from "i18next";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { AppErrorBoundary } from "../src/modules/app/components/AppErrorBoundary";
import { initBrowserPosthog } from "../src/utils/posthog";

jest.mock(
  "@heroui/react",
  () => ({
    Button: ({ children, onPress }: { children: React.ReactNode; onPress: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
  }),
  { virtual: true }
);

describe("browser and React error capture", () => {
  const events: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  let client: ReturnType<typeof initBrowserPosthog>;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
    client = initBrowserPosthog({ apiKey: "phc_test", host: "https://posthog.test" });
    client?.set_config({
      before_send: (event) => {
        events.push(event);
        return null;
      },
      capture_pageview: false,
      autocapture: false,
      disable_session_recording: true,
      advanced_disable_decide: true,
    });
  });
  beforeEach(() => {
    events.length = 0;
  });
  afterAll(() => {
    client?.opt_out_capturing();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  beforeAll(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    await i18n.use(initReactI18next).init({
      lng: "en",
      resources: {
        en: {
          "starter-app": {
            errors: {
              title: "Something went wrong",
              body: "Reload the page to try again.",
              reload: "Reload page",
            },
          },
        },
      },
    });
  });

  it("reports a React render failure once with component context and a recovery screen", async () => {
    function Broken(): React.ReactNode {
      throw new Error("render failed");
    }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container, { onCaughtError() {} });
    try {
      await act(async () => {
        root.render(
          <AppErrorBoundary client={client}>
            <Broken />
          </AppErrorBoundary>
        );
      });
      expect(container.textContent).toContain("Something went wrong");
      expect(container.querySelector("button")?.textContent).toBe("Reload page");
      const exceptions = events.filter((event) => event.event === "$exception");
      expect(exceptions).toHaveLength(1);
      expect(JSON.stringify(exceptions[0]?.properties?.$exception_list)).toContain("render failed");
      expect(exceptions[0]?.properties?.componentStack).toContain("Broken");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
  it("captures uncaught browser errors and unhandled rejections", () => {
    window.onerror?.(
      "browser failed",
      "https://app.test/assets/app.js",
      10,
      2,
      new Error("browser failed")
    );
    const rejection = Object.assign(new Event("unhandledrejection"), {
      reason: new Error("promise failed"),
      promise: Promise.resolve(),
    });
    window.onunhandledrejection?.(rejection);
    const exceptions = events.filter((event) => event.event === "$exception");
    expect(exceptions).toHaveLength(2);
    expect(JSON.stringify(exceptions[0]?.properties?.$exception_list)).toContain("browser failed");
    expect(JSON.stringify(exceptions[1]?.properties?.$exception_list)).toContain("promise failed");
  });

  it.each([undefined, "", "demo"])(
    "does not initialize without a configured key (%s)",
    (apiKey) => {
      expect(initBrowserPosthog({ apiKey })).toBeUndefined();
    }
  );
});
