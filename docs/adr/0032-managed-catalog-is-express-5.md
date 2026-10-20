# Managed catalog is Express 5.3.0

Release 0.41.0 locksteps the Express Boundary-library pin to **5.3.0**. The Kernel peer stays `catalog:`. There is no `^4 || ^5` dual-major peer and no expand–contract: `/{*splat}` 404s on Express 4. `@types/express` stays **5.0.6** because Express 5 does not ship types.

Kernel and Core Module catch-alls are named brace splats that include `/`: SPA `GET /{*splat}`, Auth `all /api/auth/{*splat}`, MCP discovery `/{*splat}`, File mock `/:bucket/{*key}` via `params.key`.

The same Release moves Kernel telemetry to OpenTelemetry JS SDK 2 (api 1.9.1, stable 2.12.0, experimental 0.223.0, `instrumentation-express` 0.71.1) so Express 5 routes can be named, and Workflow Bull Board to **9.10.4** so the board depends on Express 5. One physical Express copy comes from the catalog; there is no pnpm override.

CORS still runs first, then Better Auth / MCP `toNodeHandler`, then JSON. Kernel JSON applies `express.raw` on `POST /stripe/webhook` so Billing `constructEvent` still sees a Buffer. That skip supersedes the Stripe leftover recorded in [ADR-0003](0003-kernel-owns-express-http-shell.md).

## Considered Options

- **Dual-major Kernel peer `^4 || ^5`** — rejected: brace named splats do not match on Express 4.
- **Unnamed `*` or `/*splat` without braces** — rejected: those patterns do not include `/`, so SPA root and Auth `/api/auth` 404.
- **Keep OTEL JS SDK 1.x** — rejected: no Express 5-capable `instrumentation-express` on that generation.
- **Keep Bull Board 8.5.0 behind a pnpm Express override** — rejected: hides a second Express; Board 9.10.4 depends on Express 5.
- **Amend ADR-0003 as the only Express 5 record** — rejected: 0003 still owns the HTTP shell; this ADR records the hard cut and the 0.41.0 companions.
- **create-m5kdev registry transform** — rejected: catalog advancement is `m5kdev update`; app-owned extra HTTP is Manual.

## Consequences

- Apps on Express 4 cannot take 0.41.0 Kernel source without the catalog pin.
- Pass-in Express still must not apply JSON first.
- Stripe webhook signature verification is a Kernel JSON skip, not a Billing leftover.
