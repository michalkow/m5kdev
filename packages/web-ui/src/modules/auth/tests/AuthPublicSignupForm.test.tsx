import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import type { FormEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { AuthPublicSignupForm } from "../components/AuthPublicSignupFormRoute";

let mockSubmit: (event: FormEvent<HTMLFormElement>) => void;
jest.mock(
  "@heroui/react",
  () => ({
    Form: ({ children, onSubmit }: { children: ReactNode; onSubmit: typeof mockSubmit }) => {
      mockSubmit = onSubmit;
      return <form>{children}</form>;
    },
    Button: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
    TextField: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Input: () => <input />,
    FieldError: () => null,
    toast: { danger: jest.fn() },
  }),
  { virtual: true }
);
jest.mock("@m5kdev/frontend/modules/auth/hooks/useAuthClient", () => ({
  useAuthClient: () => require("@m5kdev/frontend/modules/auth/auth.lib").authClient,
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@m5kdev/frontend/modules/app/hooks/useAppConfig", () => ({ useAppConfig: () => ({}) }));
jest.mock("@m5kdev/frontend/modules/auth/hooks/useSession", () => ({
  useSession: () => ({ registerSession: jest.fn() }),
}));
jest.mock("@m5kdev/frontend/modules/auth/auth.lib", () => ({
  authClient: { signUp: { email: jest.fn() } },
}));

it("submits the invitation's opaque signed continuation with its original id before signup", async () => {
  jest.mocked(authClient.signUp.email).mockResolvedValue({
    data: null,
    error: { status: 400, statusText: "Bad Request", message: "Invalid link" },
  });
  renderToStaticMarkup(
    <MemoryRouter>
      <AuthPublicSignupForm
        invitation="invitation-id"
        email="invitee@example.test"
        experienceFlow="signed-proof"
      />
    </MemoryRouter>
  );
  const data = jest.spyOn(globalThis, "FormData").mockImplementation(
    () =>
      new Map([
        ["signup-email", "invitee@example.test"],
        ["signup-password", "Password-123"],
      ]) as unknown as FormData
  );
  try {
    mockSubmit({ preventDefault() {}, currentTarget: {} } as FormEvent<HTMLFormElement>);
    await new Promise((resolve) => setImmediate(resolve));
    expect(authClient.signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({ email: "invitee@example.test" }),
      {
        headers: expect.objectContaining({
          "Organization-Invitation-Code": "invitation-id",
          "X-M5kdev-Experience-Flow": "signed-proof",
        }),
      }
    );
  } finally {
    data.mockRestore();
  }
});
