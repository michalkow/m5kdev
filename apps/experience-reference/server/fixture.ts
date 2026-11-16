import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { createBackendApp } from "@m5kdev/backend/app";
import * as authTables from "@m5kdev/backend/modules/auth/auth.db";
import { createBetterAuth } from "@m5kdev/backend/modules/auth/auth.lib";
import { AuthModule } from "@m5kdev/backend/modules/auth/auth.module";
import * as billingTables from "@m5kdev/backend/modules/billing/billing.db";
import { BillingModule } from "@m5kdev/backend/modules/billing/billing.module";
import type { BillingService } from "@m5kdev/backend/modules/billing/billing.service";
import { EmailModule } from "@m5kdev/backend/modules/email/email.module";
import type { EmailTemplates } from "@m5kdev/backend/modules/email/email.service";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import Stripe from "stripe";
import { catalog } from "./catalog";
import { ReferenceModule } from "./reference.module";
import { prepareExperienceTables } from "./test-database";

const schema = {
  users: authTables.users,
  sessions: authTables.sessions,
  accounts: authTables.accounts,
  verifications: authTables.verifications,
  organizations: authTables.organizations,
  members: authTables.members,
  invitations: authTables.invitations,
  apikeys: authTables.apikeys,
  waitlist: authTables.waitlist,
  accountClaims: authTables.accountClaims,
  accountClaimMagicLinks: authTables.accountClaimMagicLinks,
  subscriptions: billingTables.subscriptions,
};
const secret = "reference-local-only-credential-at-least-thirty-two-characters";
export async function bootReference(topology: "local" | "shared") {
  const namespace = process.env.DATABASE_SCHEMA;
  if (!namespace || !/^test_[a-f0-9]+$/.test(namespace))
    throw new Error("Reference requires an owned test schema");
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });
  let server: Server | undefined;
  let shutdown: () => Promise<void> = async () => {};
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (server)
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve()))
        );
      await shutdown();
      await pool.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    } finally {
      await pool.end();
    }
  };
  try {
    await prepareExperienceTables(pool, schema);
    const orm = drizzle(pool, { schema });
    await orm.insert(authTables.users).values({
      id: "person",
      name: "Person",
      email: "person@example.test",
      emailVerified: true,
      role: "user",
      locale: "en_GB",
      preferences: { compactMode: true },
    });
    await orm.insert(authTables.accounts).values({
      id: "credential",
      providerId: "credential",
      accountId: "person",
      userId: "person",
      password: await hashPassword("Reference-Password-123"),
    });
    const customerPlans = new Map<string, string>();
    const orgs = ["reports", "combined", "unpaid", "exempt", "denied"];
    for (const id of orgs) {
      await orm.insert(authTables.organizations).values({
        id: `org_${id}`,
        name: id,
        slug: id,
        currency: "usd",
        locale: "en_GB",
        billingExempt: id === "exempt",
        stripeSandboxCustomerId: `cus_${id}`,
      });
      await orm.insert(authTables.members).values({
        id: `member_${id}`,
        organizationId: `org_${id}`,
        userId: "person",
        email: "person@example.test",
        role: id === "denied" ? "member" : "owner",
      });
      if (id !== "unpaid" && id !== "exempt")
        customerPlans.set(`cus_${id}`, id === "reports" ? "price_reports" : "price_combined");
    }
    const creates: { kind: string; params: URLSearchParams }[] = [];
    const stripe = new Stripe("sk_test_recording_reference", {
      httpClient: Stripe.createFetchHttpClient(
        async (url: RequestInfo | URL, init?: RequestInit) => {
          const parsed = new URL(String(url));
          const pathname = parsed.pathname;
          const params = new URLSearchParams(
            typeof init?.body === "string" ? init.body : undefined
          );
          let data: unknown;
          if (pathname.startsWith("/v1/customers/"))
            data = {
              id: pathname.split("/").at(-1),
              object: "customer",
              email: "person@example.test",
              metadata: {},
              invoice_settings: { default_payment_method: null },
            };
          else if (pathname === "/v1/subscriptions") {
            const customer = parsed.searchParams.get("customer") ?? "";
            const price = customerPlans.get(customer);
            const now = Math.floor(Date.now() / 1000);
            data = {
              object: "list",
              data: price
                ? [
                    {
                      id: `sub_${customer}`,
                      object: "subscription",
                      customer,
                      status: "active",
                      items: {
                        data: [
                          {
                            id: `si_${customer}`,
                            quantity: 1,
                            price: {
                              id: price,
                              unit_amount: 1000,
                              recurring: { interval: "month", interval_count: 1 },
                            },
                            current_period_start: now,
                            current_period_end: now + 86400,
                          },
                        ],
                      },
                      discounts: [],
                      cancel_at_period_end: false,
                      metadata: {},
                    },
                  ]
                : [],
            };
          } else if (pathname === "/v1/invoices") data = { object: "list", data: [] };
          else if (
            pathname === "/v1/checkout/sessions" ||
            pathname === "/v1/billing_portal/sessions"
          ) {
            const kind = pathname.includes("checkout") ? "checkout" : "portal";
            creates.push({ kind, params });
            data = {
              id: `recorded_${creates.length}`,
              object: "session",
              url: `https://recorded-stripe.example.test/${kind}/${creates.length}`,
            };
          } else throw new Error(`Unrecorded Stripe request: ${pathname}`);
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      ),
    });
    // Bind the listener first so canonical configured origins contain the real assigned port.
    const { default: express } = await import("express");
    const shell = express();
    server = await new Promise<Server>((resolve, reject) => {
      const listening = shell.listen(0, "127.0.0.1", () => resolve(listening));
      listening.once("error", reject);
    });
    const port = (server.address() as AddressInfo).port;
    const hosts =
      topology === "local"
        ? { alpha: "alpha.test", beta: "beta.test", partner: "partner.test" }
        : {
            alpha: "a.experience.test",
            beta: "b.experience.test",
            partner: "partner.experience.test",
          };
    const origins = Object.fromEntries(
      Object.entries(hosts).map(([id, host]) => [id, `http://${host}:${port}`])
    );
    const definitions = Object.fromEntries(
      Object.entries(origins).map(([id, webOrigin]) => [
        id,
        {
          product: id === "beta" ? "assistant" : "reports",
          brand: id,
          webOrigin,
          apiOrigin: topology === "shared" ? `http://api.experience.test:${port}` : webOrigin,
        },
      ])
    );
    const template = { id: "reference", react: () => null };
    const templates: EmailTemplates = {
      accountDeletion: template,
      verification: template,
      passwordReset: template,
      organizationInvite: template,
    };
    const webRoot = fileURLToPath(new URL("../dist", import.meta.url));
    const built = createBackendApp(
      {
        db: { client: pool },
        schema,
        express: shell,
        env: { APP_ENV: "local", APP_SLUG: "experience-reference", BETTER_AUTH_SECRET: secret },
        app: {
          experiences: {
            defaultExperience: "alpha",
            brands: {
              alpha: { name: "Alpha Reports" },
              beta: { name: "Beta Assistant" },
              partner: { name: "Partner Reports" },
            },
            definitions,
          },
          locales: {
            defaultLocale: "en",
            locales: [
              { code: "en", displayName: "English" },
              { code: "en_GB", displayName: "English (UK)" },
            ],
          },
        },
        email: {
          mode: "store",
          from: "reference@example.test",
          outputDirectory: "/tmp/m5kdev-implement-88/99-artifacts/emails",
        },
        spa: { root: webRoot },
        auth: {
          factory: ({ db, appConfig, experienceFlows, services }) =>
            createBetterAuth({
              orm: db.orm,
              schema,
              app: appConfig,
              experienceFlows,
              services: { email: services.email.email },
              options: { secret, rateLimit: { enabled: false } },
            }),
        },
      },
      [
        new EmailModule(templates),
        new BillingModule(
          {
            stripe,
            resolveCheckoutSessionCreate: ({ experience }) => ({
              metadata: { referenceExperience: experience.id },
            }),
            resolveBillingPortalSessionCreate: ({ experience }) => ({
              configuration: `bpc_${experience.id}`,
            }),
          },
          catalog
        ),
        new AuthModule(),
        new ReferenceModule(await readFile(`${webRoot}/index.html`, "utf8")),
      ] as const
    );
    shutdown = () => built.shutdown();
    const billing = built.modules.billing.services.billing as BillingService;
    for (const id of orgs.filter((id) => customerPlans.has(`cus_${id}`)))
      (await billing.syncStripeData({ customerId: `cus_${id}` }))._unsafeUnwrap();
    return {
      built,
      pool,
      orm,
      port,
      origins,
      creates,
      changePlan: async (id: string, price: string) => {
        customerPlans.set(`cus_${id}`, price);
        (await billing.syncStripeData({ customerId: `cus_${id}` }))._unsafeUnwrap();
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
export type ReferenceRouter = Awaited<ReturnType<typeof bootReference>>["built"]["trpc"]["router"];
