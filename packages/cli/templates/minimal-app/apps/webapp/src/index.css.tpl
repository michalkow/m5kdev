/* biome-ignore-all lint/suspicious/noUnknownAtRules: Tailwind v4 */

@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap");
@import "tailwindcss";
@import "tw-animate-css";

@plugin './hero.ts';

@source "./src/**/*.{ts,tsx}";
@source "../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}";
@source "../../node_modules/@m5kdev/web-ui/dist/src/**/*.{js,ts,jsx,tsx}";

@custom-variant dark (&:is(.dark *));

:root {
  --canvas: #f4ede2;
  --ink: #171314;
  --muted-ink: #6f635c;
  --panel: #fffaf1;
  --panel-strong: #f8efdf;
  --line: rgba(124, 93, 55, 0.18);
  --halo: rgba(231, 182, 100, 0.28);
}

.dark {
  --canvas: #12100f;
  --ink: #f7f1e8;
  --muted-ink: #b9aba0;
  --panel: #1d1917;
  --panel-strong: #26211f;
  --line: rgba(255, 240, 219, 0.12);
  --halo: rgba(77, 162, 143, 0.22);
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-ink: var(--ink);
  --color-muted-ink: var(--muted-ink);
  --color-panel: var(--panel);
  --color-panel-strong: var(--panel-strong);
  --color-line: var(--line);
  --color-halo: var(--halo);
}

@layer base {
  * {
    @apply border-line;
  }

  html,
  body,
  #root {
    min-height: 100%;
  }

  body {
    @apply bg-canvas text-ink;
    background-image:
      radial-gradient(circle at top left, rgba(246, 189, 96, 0.16), transparent 28%),
      radial-gradient(circle at 80% 10%, rgba(31, 79, 70, 0.14), transparent 22%),
      linear-gradient(180deg, rgba(255, 250, 241, 0.36), rgba(244, 237, 226, 0.1));
    font-family: "Manrope", "Helvetica Neue", Arial, sans-serif;
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }
}

.font-editorial {
  font-family: "Cormorant Garamond", Georgia, serif;
}
