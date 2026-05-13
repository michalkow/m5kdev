import { buttonVariants } from "@heroui/styles";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { Building2, LogOut, MailPlus, ShieldCheck, UserCog } from "lucide-react";
import { APP_NAME } from "m5kdev-auth-e2e-shared/modules/app/app.constants";
import { Link, Outlet } from "react-router";

const links = [
  { to: "/posts", label: "Posts", icon: Building2 },
  { to: "/organization/members", label: "Members", icon: MailPlus },
  { to: "/organization/manage", label: "Child Orgs", icon: Building2 },
  { to: "/user/invite", label: "Waitlist Invites", icon: MailPlus },
  { to: "/admin/users", label: "Admin", icon: ShieldCheck },
  { to: "/user/preferences", label: "Profile", icon: UserCog },
];

export function Layout() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule/80 bg-white/88 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
          <Link to="/posts" className="mr-auto">
            <span className="block text-xs font-semibold uppercase tracking-[0.24em] text-default-500">
              Auth fixture
            </span>
            <span className="font-editorial text-2xl">{APP_NAME}</span>
          </Link>
          <span className="text-sm text-default-600" data-testid="session-email">
            {session?.user.email}
          </span>
          <Link to="/logout" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <LogOut size={16} />
            Logout
          </Link>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3">
          {links.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
