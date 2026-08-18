import { Button, Card } from "@heroui/react";

export function LandingPage() {
  const appName = import.meta.env.VITE_APP_NAME ?? "M5 Starter";
  const appUrl = import.meta.env.VITE_APP_URL ?? "http://localhost:5173";

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
        <Card.Header className="grid gap-4 p-8 pb-4 sm:p-10 sm:pb-4">
          <p className="text-xs font-medium tracking-[0.28em] text-[color-mix(in_oklch,var(--color-ink)_55%,transparent)] uppercase">
            Public site
          </p>
          <Card.Title className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] font-medium tracking-tight sm:text-6xl">
            {appName}
          </Card.Title>
          <Card.Description className="max-w-md text-base leading-relaxed text-[color-mix(in_oklch,var(--color-ink)_72%,transparent)]">
            An AI SaaS workspace. Sign in on the app when you are ready to write, ship, and operate.
          </Card.Description>
        </Card.Header>
        <Card.Footer className="p-8 pt-2 sm:p-10 sm:pt-2">
          <Button variant="primary" onPress={() => window.location.assign(appUrl)}>
            Open app
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}
