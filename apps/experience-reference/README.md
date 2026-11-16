# Experience reference composition

This private test app serves **one compiled SPA** through the real Kernel. Alpha
Reports and Partner Reports reuse the reports product/workflow; Beta Assistant
owns a different shell. Membership, Plan/Bundles/Capabilities and Grants continue
to authorize the same server operation independently of the selected brand.
It is outside Starter and is never copied into generated apps.

Build the affected framework packages first, then:

```sh
pnpm --filter @m5kdev/experience-reference build
TEST_DATABASE_URL=postgresql://localhost:55488/m5kdev_88_test TEST_REDIS_URL=redis://127.0.0.1:55489 pnpm --filter @m5kdev/experience-reference test
TEST_DATABASE_URL=postgresql://localhost:55488/m5kdev_88_test TEST_REDIS_URL=redis://127.0.0.1:55489 REFERENCE_TOPOLOGY=shared pnpm --filter @m5kdev/experience-reference test
```

Use an explicitly disposable local PostgreSQL database. The Node worker creates
a unique owned `test_<uuid>` schema before importing database models and drops
only that schema on shutdown or failed boot. Run one fixture per worker process:
Drizzle's schema is selected when its owning module is imported. No app migration,
production database or external Stripe account is involved. Real Redis is required;
Workflow uses a unique `reference-test_<uuid>` prefix and removes only its own keys
after worker shutdown. Local File objects use a uniquely owned bucket directory
and only that directory is removed. If Playwright's
Chromium is unavailable but Chrome is installed, add `PLAYWRIGHT_CHANNEL=chrome`.
Chromium host-resolver rules map the configured `.test` authorities to loopback;
no OS DNS or hosts file changes are needed.

Default topology uses unrelated `alpha.test`, `beta.test` and `partner.test`
with domain-local API/session cookies, representing same-origin reverse proxies.
Shared topology uses `a.experience.test`, `b.experience.test` and
`partner.experience.test` against `api.experience.test`, so the browser can send
its SameSite API cookie while Origin selects presentation. This proves that
supported shared-API topology; it does not promise cross-site cookie support or
SSO between unrelated domains.

`/supplied` embeds only the matching public descriptor as escaped JSON and mounts
the same frontend/providers without another bootstrap fetch. All routes use the
same asset root. The app owns routing; the framework does not turn capabilities
into navigation or reset saved locale/preferences when an Organization changes.

Stripe's SDK uses its supported recording HTTP transport. Only the external API
responses and external browser destination are simulated. Actual app service,
repository, authorization and PostgreSQL behavior are exercised. Node-held test
controls change the recorded upstream Subscription then run real reconciliation;
there are no public test-control endpoints. This does not verify hosted Stripe
appearance, actual payment or account-level branding.

Browser screenshots/HTML and the test report are written under
`REFERENCE_ARTIFACT_ROOT` (default `/tmp/m5kdev-implement-88/99-artifacts`).
Set it to a new directory to retain an independent run.

The same composition includes real verification/recovery, invitations, waitlist,
exact account claim, Connection callback/cancellation, Checkout/Portal return,
immediate/delayed emails and signed trial webhook journeys. Connection browser
initiation uses private JSON POST before provider navigation, including shared API.
Only the external provider authorization/token and Stripe boundaries are recorded;
actual callbacks, token consumption, cookies, resource state and reconciliation use
the real Kernel, PG and Redis. No public test-control routes are exposed. They contain disposable test data only.
