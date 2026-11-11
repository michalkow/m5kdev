import { Button } from "@heroui/react";
import type { PostHog } from "posthog-js";
import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";

function AppErrorFallback() {
  const { t } = useTranslation("starter-app");
  return (
    <main
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">{t("errors.title")}</h1>
      <p className="text-muted">{t("errors.body")}</p>
      <Button onPress={() => window.location.reload()}>{t("errors.reload")}</Button>
    </main>
  );
}

// React exposes componentDidCatch/getDerivedStateFromError only through class
// components; this infrastructure boundary is the narrow exception to function components.
export class AppErrorBoundary extends Component<
  PropsWithChildren<{ client?: PostHog }>,
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.client?.captureException(error, { componentStack: info.componentStack });
  }

  override render() {
    return this.state.failed ? <AppErrorFallback /> : this.props.children;
  }
}
