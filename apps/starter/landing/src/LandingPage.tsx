import { Card } from "@heroui/react";

export function LandingPage() {
  const appName = import.meta.env.VITE_APP_NAME ?? "M5 Starter";

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.92_0.04_85),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:repeating-linear-gradient(0deg,transparent,transparent_23px,var(--color-rule)_24px)]"
      />
      <Card className="relative max-w-xl border border-[var(--color-rule)] bg-[color-mix(in_oklch,var(--color-paper)_92%,white)] shadow-none">
        <Card.Header className="grid gap-4 p-8 sm:p-10">
          <p className="text-xs font-medium tracking-[0.28em] text-[color-mix(in_oklch,var(--color-ink)_55%,transparent)] uppercase">
            Public site
          </p>
          <Card.Title className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] font-medium tracking-tight sm:text-6xl">
            {appName}
          </Card.Title>
          <Card.Description className="max-w-md text-base leading-relaxed text-[color-mix(in_oklch,var(--color-ink)_72%,transparent)]">
            An AI SaaS workspace.
          </Card.Description>
        </Card.Header>
      </Card>
    </main>
  );
}
