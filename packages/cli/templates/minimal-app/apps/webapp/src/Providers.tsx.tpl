import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { DialogProvider } from "@m5kdev/web-ui/components/DialogProvider";
import { ThemeProvider } from "@m5kdev/web-ui/components/theme-provider";
import { AppLoader } from "@m5kdev/web-ui/modules/app/components/AppLoader";
import { Toaster } from "sonner";
import { TrpcQueryProvider } from "@/components/TrpcQueryProvider";
import { Router } from "./Router";

export function Providers() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="m5kdev-theme">
      <AuthProvider loader={<AppLoader />}>
        <TrpcQueryProvider>
          <DialogProvider>
            <Router />
          </DialogProvider>
          <Toaster richColors closeButton />
        </TrpcQueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
