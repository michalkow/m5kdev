import { publicExperienceSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import i18n from "i18next";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { ExperienceBootstrap } from "../components/ExperienceBootstrap";

jest.mock("better-auth/react", () => ({ createAuthClient: () => ({}) }), {
  virtual: true,
});
jest.mock(
  "better-auth/client/plugins",
  () => ({
    adminClient: () => ({}),
    inferAdditionalFields: () => ({}),
    inferOrgAdditionalFields: () => ({}),
    lastLoginMethodClient: () => ({}),
    organizationClient: () => ({}),
  }),
  { virtual: true }
);
jest.mock(
  "@heroui/react",
  () => ({
    Button: ({ children, onPress }: ComponentProps<"button"> & { onPress: () => void }) => (
      <button type="button" onClick={onPress}>
        {children}
      </button>
    ),
  }),
  { virtual: true }
);
const selected = publicExperienceSchema.parse({
  id: "selected",
  product: "starter",
  brand: { name: "Selected Product" },
  webOrigin: "https://selected.example.test",
  apiOrigin: "https://api.example.test",
});
let root: Root;
let container: HTMLDivElement;
beforeAll(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: {
      en: {
        "starter-app": {
          bootstrap: {
            loading: "Loading product",
            error: "Unable to load product",
            retry: "Try again",
          },
        },
      },
    },
  });
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});
function authChild(getSession: jest.Mock) {
  return (
    <AuthProvider authClient={{ getSession } as never} loader={<p>Checking account</p>}>
      <p>Authenticated application</p>
    </AuthProvider>
  );
}
it("loads the selected descriptor before Auth initializes and shows its identity during session loading", async () => {
  let release!: (value: unknown) => void;
  const fetcher = jest.fn(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  Object.assign(globalThis, { fetch: fetcher });
  const getSession = jest.fn(() => new Promise(() => {}));
  await act(async () =>
    root.render(
      <ExperienceBootstrap url="https://bootstrap.example.test/app/experience">
        {authChild(getSession)}
      </ExperienceBootstrap>
    )
  );
  expect(getSession).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Loading product");
  await act(async () => release({ ok: true, json: async () => selected }));
  expect(getSession).toHaveBeenCalledTimes(1);
  expect(document.title).toBe("Selected Product");
  expect(container.textContent).toContain("Checking account");
  expect(fetcher).toHaveBeenCalledWith(
    "https://bootstrap.example.test/app/experience",
    expect.objectContaining({ credentials: "include", cache: "no-store" })
  );
});
it("keeps Auth stopped on bootstrap failure and retries the actual descriptor request", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({ ok: true, json: async () => selected });
  Object.assign(globalThis, { fetch: fetcher });
  const getSession = jest.fn(() => new Promise(() => {}));
  await act(async () =>
    root.render(
      <ExperienceBootstrap url="/app/experience">{authChild(getSession)}</ExperienceBootstrap>
    )
  );
  expect(getSession).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Unable to load product"
  );
  await act(async () => container.querySelector("button")!.click());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(getSession).toHaveBeenCalledTimes(1);
  expect(document.title).toBe("Selected Product");
});
it("uses an explicitly supplied matching descriptor without a bootstrap request", async () => {
  const fetcher = jest.fn();
  Object.assign(globalThis, { fetch: fetcher });
  const getSession = jest.fn(() => new Promise(() => {}));
  await act(async () =>
    root.render(
      <ExperienceBootstrap url="/app/experience" supplied={selected}>
        {authChild(getSession)}
      </ExperienceBootstrap>
    )
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(getSession).toHaveBeenCalledTimes(1);
  expect(document.title).toBe("Selected Product");
});
