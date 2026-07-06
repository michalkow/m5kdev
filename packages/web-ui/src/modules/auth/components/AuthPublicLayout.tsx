import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { useAuthPublicLocale } from "../hooks/useAuthPublicLocale";
import { AuthPublicLocaleSwitcher } from "./AuthPublicLocaleSwitcher";

export interface AuthPublicLayoutProps {
  header: ReactNode;
  onLocaleChange?: (locale: string) => void | Promise<void>;
}

export function AuthPublicLayout({ header, onLocaleChange }: AuthPublicLayoutProps) {
  const { locale, setLocale, locales } = useAuthPublicLocale(onLocaleChange);
  const showLocaleSwitcher = Boolean(locales && locales.locales.length > 1 && locale);

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      {showLocaleSwitcher && locale ? (
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <AuthPublicLocaleSwitcher value={locale} onChange={setLocale} />
        </div>
      ) : null}
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">{header}</div>
        <Outlet />
      </div>
    </div>
  );
}
