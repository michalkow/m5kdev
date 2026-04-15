import type { ReactNode } from "react";
import { Outlet } from "react-router";

export function AuthLayout({ header }: { header: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">{header}</div>
        <Outlet />
      </div>
    </div>
  );
}
