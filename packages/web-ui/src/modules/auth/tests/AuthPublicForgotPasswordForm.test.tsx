import { toast } from "@heroui/react";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import type { FormEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthPublicForgotPasswordForm } from "../components/AuthPublicForgotPasswordForm";

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
    toast: { success: jest.fn(), danger: jest.fn() },
  }),
  { virtual: true }
);
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock("@m5kdev/frontend/modules/auth/auth.lib", () => {
  const authClient = { requestPasswordReset: jest.fn() };
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
      <AuthPublicForgotPasswordForm />
    </AppConfigProvider>
  );
  const fields = new FormData();
  fields.set("forgot-password-email", "person@example.test");
  const formData = jest.spyOn(globalThis, "FormData").mockImplementation(() => fields);
  try {
    await Reflect.apply(mockSubmit, undefined, [{ preventDefault() {}, currentTarget: {} }]);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    formData.mockRestore();
  }
}

describe("forgotten password result", () => {
  beforeEach(() => jest.clearAllMocks());
  it("shows success for the generic accepted recovery request", async () => {
    jest
      .mocked(authClient.requestPasswordReset)
      .mockResolvedValue({ data: { status: true, message: "accepted" }, error: null });
    await submit();
    expect(authClient.requestPasswordReset).toHaveBeenCalledWith(
      { email: "person@example.test", redirectTo: "https://horeka.example.test/reset-password" },
      { headers: {} }
    );
    expect(toast.success).toHaveBeenCalledWith("web-ui:auth.forgotPassword.success");
    expect(toast.danger).not.toHaveBeenCalled();
  });
  it("reports a resolved transport/context failure without a success message", async () => {
    jest.mocked(authClient.requestPasswordReset).mockResolvedValue({
      data: null,
      error: { status: 400, statusText: "Bad Request", message: "Invalid Experience" },
    });
    await submit();
    expect(toast.danger).toHaveBeenCalledWith("web-ui:auth.forgotPassword.error");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
