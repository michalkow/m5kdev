import { APP_NAME } from "{{PACKAGE_SCOPE}}/shared/modules/app/app.constants";
import { Button, Chip } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useTheme } from "@m5kdev/web-ui/components/theme-provider";
import {
  BookTextIcon,
  LogOutIcon,
  MoonStarIcon,
  NotebookTextIcon,
  SunMediumIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";
import { PushNotificationsPanel } from "./modules/notification/PushNotificationsPanel";

export function Layout() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation("blog-app");

  const userName = session?.user?.name || session?.user?.email || "Editor";
  const userEmail = session?.user?.email || "";

  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 py-4 lg:flex-row lg:px-6">
        <aside className="w-full rounded-[32px] border border-white/60 bg-white/70 p-5 shadow-[0_24px_60px_rgba(81,50,24,0.14)] backdrop-blur xl:w-[320px]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-amber-700/80">
                {t("layout.brand.eyebrow")}
              </p>
              <h1 className="mt-3 font-editorial text-4xl leading-none text-ink">{APP_NAME}</h1>
              <p className="mt-3 max-w-[22ch] text-sm leading-6 text-ink/70">
                {t("layout.brand.tagline")}
              </p>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50/90 p-3 text-amber-700">
              <NotebookTextIcon className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-amber-200/70 bg-amber-50/85 p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-amber-700/80">
              {t("layout.workspace.eyebrow")}
            </p>
            <p className="mt-3 font-editorial text-2xl leading-none text-ink">
              {t("layout.workspace.title")}
            </p>
            <p className="mt-3 text-sm leading-6 text-ink/75">{t("layout.workspace.body")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip color="warning" variant="flat">
                {t("layout.workspace.local")}
              </Chip>
              <Chip color="success" variant="flat">
                {t("layout.workspace.auth")}
              </Chip>
            </div>
          </div>

          <PushNotificationsPanel />

          <nav className="mt-8 grid gap-2">
            <NavLink
              to="/posts"
              className={({ isActive }) =>
                isActive
                  ? "group flex items-center gap-3 rounded-[22px] border border-emerald-300 bg-emerald-950 px-4 py-3 text-emerald-50"
                  : "group flex items-center gap-3 rounded-[22px] border border-transparent bg-transparent px-4 py-3 text-ink/80 transition hover:border-amber-200 hover:bg-white/70"
              }
            >
              <BookTextIcon className="h-4 w-4" />
              <span className="font-medium">{t("layout.navigation.posts")}</span>
            </NavLink>
          </nav>

          <div className="mt-8 rounded-[28px] border border-white/60 bg-stone-950 px-4 py-4 text-stone-100 shadow-[0_16px_32px_rgba(23,19,20,0.2)]">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              {t("layout.account.eyebrow")}
            </p>
            <p className="mt-3 text-lg font-semibold">{userName}</p>
            <p className="mt-1 text-sm text-stone-300">{userEmail}</p>
            <div className="mt-4 flex items-center gap-2">
              <Button
                radius="full"
                size="sm"
                variant="flat"
                className="bg-stone-800 text-stone-100"
                onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? (
                  <SunMediumIcon className="h-4 w-4" />
                ) : (
                  <MoonStarIcon className="h-4 w-4" />
                )}
                {theme === "dark" ? t("layout.account.light") : t("layout.account.dark")}
              </Button>
              <Button
                radius="full"
                size="sm"
                color="danger"
                variant="flat"
                onPress={() => {
                  authClient.signOut();
                  window.location.assign("/login");
                }}
              >
                <LogOutIcon className="h-4 w-4" />
                {t("layout.account.signOut")}
              </Button>
            </div>
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-2rem)] flex-1 flex-col rounded-[32px] border border-white/60 bg-white/72 shadow-[0_24px_60px_rgba(81,50,24,0.14)] backdrop-blur">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/70 px-6 py-5">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-emerald-800/70">
                {t("layout.header.eyebrow")}
              </p>
              <h2 className="mt-2 font-editorial text-4xl leading-none text-ink">
                {t("layout.header.title")}
              </h2>
            </div>
            <Chip
              radius="full"
              className="border border-emerald-300 bg-emerald-50 px-4 py-5 text-emerald-900"
              variant="bordered"
            >
              {t("layout.header.runtime")}
            </Chip>
          </header>

          <div className="flex-1 px-4 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
