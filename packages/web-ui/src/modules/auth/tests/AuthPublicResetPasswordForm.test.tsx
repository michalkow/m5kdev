import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import type { FormEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { AuthPublicResetPasswordForm } from "../components/AuthPublicResetPasswordForm";

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
    Input: () => <input />,
    Label: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    FieldError: () => null,
    ErrorMessage: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  }),
  { virtual: true }
);
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock(
  "nuqs",
  () => ({
    parseAsString: {},
    useQueryStates: () => [{ token: "reset-token", experienceFlow: "signed-continuation" }],
  }),
  { virtual: true }
);
jest.mock("@m5kdev/frontend/modules/auth/auth.lib", () => {
  const authClient = { resetPassword: jest.fn() };
  return { authClient, getAuthClient: () => authClient };
});

async function submit() {
  renderToStaticMarkup(
    <AppConfigProvider
      config={{
        appName: "Horeka",
        appUrl: "https://horeka.example.test",
        serverUrl: "https://horeka.example.test",
      }}
    >
      <MemoryRouter
        initialEntries={["/reset-password?token=reset-token&experienceFlow=signed-continuation"]}
      >
        <AuthPublicResetPasswordForm />
      </MemoryRouter>
    </AppConfigProvider>
  );
  const formData = jest.spyOn(globalThis, "FormData").mockImplementation(
    () =>
      new Map([
        ["reset-password-new", "Changed-Password-456"],
        ["reset-password-confirm", "Changed-Password-456"],
      ]) as unknown as FormData
  );
  try {
    await mockSubmit({ preventDefault() {}, currentTarget: {} } as FormEvent<HTMLFormElement>);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    formData.mockRestore();
  }
}

describe("password recovery form transport", () => {
  it.each(["PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG", "PASSWORD_COMPROMISED", undefined])(
    "keeps a rejected password or unrelated HTTP400 on the form (%s)",
    async (code) => {
      jest.mocked(authClient.resetPassword).mockResolvedValue({
        data: null,
        error: { status: 400, statusText: "Bad Request", code, message: "Password rejected" },
      });
      await submit();
      expect(toast.error).toHaveBeenCalledWith("web-ui:auth.resetPassword.error");
      expect(toast.error).not.toHaveBeenCalledWith("web-ui:auth.resetPassword.linkInvalid");
      expect(toast.success).not.toHaveBeenCalled();
    }
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("submits the token-bound continuation in a request header", async () => {
    jest
      .mocked(authClient.resetPassword)
      .mockResolvedValue({ data: { status: true }, error: null });
    await submit();
    expect(authClient.resetPassword).toHaveBeenCalledWith(
      { token: "reset-token", newPassword: "Changed-Password-456" },
      { headers: { "X-M5kdev-Experience-Flow": "signed-continuation" } }
    );
    expect(toast.success).toHaveBeenCalledWith("web-ui:auth.resetPassword.success");
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("does not report success when the server returns an invalid-link error", async () => {
    jest.mocked(authClient.resetPassword).mockResolvedValue({
      data: null,
      error: {
        status: 400,
        statusText: "Bad Request",
        code: "INVALID_TOKEN",
        message: "Invalid recovery continuation",
      },
    });
    await submit();
    expect(toast.error).toHaveBeenCalledWith("web-ui:auth.resetPassword.linkInvalid");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
