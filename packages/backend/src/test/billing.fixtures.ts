import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ResolvedStripePlans } from "@m5kdev/commons/modules/billing/billing.types";
import { transformer } from "@m5kdev/commons/utils/trpc";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type Stripe from "stripe";
import { z } from "zod";
import { createBackendApp } from "../app";
import * as authTables from "../modules/auth/auth.db";
import { createBetterAuth } from "../modules/auth/auth.lib";
import { AuthModule } from "../modules/auth/auth.module";
import * as billingTables from "../modules/billing/billing.db";
import { BillingModule, type BillingModuleLibs } from "../modules/billing/billing.module";
import { EmailModule } from "../modules/email/email.module";
import type { EmailTemplates } from "../modules/email/email.service";
import { experienceConfig, prepareExperienceTables } from "./experience.fixtures";
import { createTestPool } from "./postgresql";

export const BILLING_SECRET = "billing-http-test-secret-at-least-thirty-two-characters";
export const billingSchema = { ...authTables, ...billingTables };
export const billingCatalog: ResolvedStripePlans = {
  environment: "sandbox",
  plans: [
    {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          defaultPriceId: "price_usd",
          prices: [{ priceId: "price_usd", interval: "month", intervalCount: 1, unitAmount: 3900 }],
        },
      },
    },
  ],
  trialPlanName: {},
  trialRequiresPaymentMethod: false,
  defaultCurrency: "usd",
  seatBilling: false,
  nonBillableRoleKeys: [],
};
const template = { id: "fixture", react: () => null };
export const billingTemplates: EmailTemplates = {
  accountDeletion: template,
  verification: template,
  waitlistConfirmation: template,
  passwordReset: template,
  systemWaitlistNotification: template,
  waitlistInvite: template,
  waitlistUserInvite: template,
  organizationInvite: template,
};

export async function billingFixture(
  options: {
    shared?: boolean;
    legacy?: boolean;
    secret?: string | null;
    libs?: Partial<BillingModuleLibs>;
    catalog?: ResolvedStripePlans;
  } = {}
) {
  const pool = createTestPool();
  await prepareExperienceTables(pool, billingSchema);
  const orm = drizzle(pool, { schema: billingSchema });
  const password = await hashPassword("Original-Password-123");
  await orm.insert(authTables.users).values({
    id: "person",
    name: "Person",
    email: "person@example.test",
    emailVerified: true,
    role: "user",
  });
  await orm.insert(authTables.accounts).values({
    id: "credential",
    providerId: "credential",
    accountId: "person",
    userId: "person",
    password,
  });
  for (const id of ["one", "two"]) {
    await orm.insert(authTables.organizations).values({
      id: `org_${id}`,
      name: id,
      currency: "usd",
      locale: "en_GB",
      stripeSandboxCustomerId: `cus_${id}`,
      stripeCustomerId: `cus_live_${id}`,
    });
    await orm.insert(authTables.members).values({
      id: `member_${id}`,
      organizationId: `org_${id}`,
      userId: "person",
      email: "person@example.test",
      role: "owner",
    });
  }
  const creates: Stripe.Checkout.SessionCreateParams[] = [];
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const subscriptions = new Map<string, Stripe.Subscription>();
  const retrieved: string[] = [];
  const synced: string[] = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams) => {
          const id = `cs_test_${creates.length + 1}`;
          creates.push(structuredClone(params));
          const result = {
            id,
            url: `https://checkout.stripe.com/c/pay/${id}`,
            customer: params.customer,
            metadata: params.metadata,
            status: "open",
            livemode: false,
            expires_at: Math.floor(Date.now() / 1000) + 86400,
          } as Stripe.Checkout.Session;
          sessions.set(id, result);
          return result;
        },
        retrieve: async (id: string) => {
          retrieved.push(id);
          const session = sessions.get(id);
          if (!session) throw new Error("Unknown Checkout Session");
          return session;
        },
      },
    },
    customers: {
      retrieve: async (id: string) => {
        if (!["cus_one", "cus_two", "cus_live_one", "cus_live_two"].includes(id))
          throw new Error("Unknown Customer");
        return {
          id,
          email: "person@example.test",
          deleted: false,
          metadata: {},
          invoice_settings: { default_payment_method: null },
        };
      },
    },
    subscriptions: {
      list: async ({ customer }: { customer: string }) => {
        synced.push(customer);
        return { data: subscriptions.has(customer) ? [subscriptions.get(customer)] : [] };
      },
    },
    webhooks: { constructEvent: (body: Buffer) => JSON.parse(body.toString()) },
  } as unknown as Stripe;
  const apiHost = (id: string) => (options.shared ? "api.example.test" : `${id}.example.test`);
  const app = options.legacy
    ? {
        name: "Legacy",
        urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
      }
    : {
        experiences: {
          ...experienceConfig,
          definitions: Object.fromEntries(
            Object.entries(experienceConfig.definitions).map(([id, definition]) => [
              id,
              {
                ...definition,
                apiOrigin: `https://${apiHost(id)}`,
                ...(id === "radar" ? { aliases: ["https://alias-radar.example.test"] } : {}),
              },
            ])
          ),
        },
      };
  const secret = options.secret === undefined ? BILLING_SECRET : options.secret;
  const built = await (async () => {
    try {
      return createBackendApp(
        {
          db: { client: pool },
          schema: billingSchema,
          env: {
            APP_ENV: "local",
            APP_SLUG: "billing-http",
            BETTER_AUTH_SECRET: secret ?? undefined,
          },
          app,
          email: {
            mode: "store",
            from: "test@example.test",
            outputDirectory: "/tmp/m5kdev-implement-88/97-artifacts/emails",
          },
          auth: {
            factory: ({ db, appConfig, experienceFlows, services }) =>
              createBetterAuth({
                orm: db.orm,
                schema: billingSchema,
                app: appConfig,
                experienceFlows,
                services: { email: services.email.email },
                options: { secret: secret ?? BILLING_SECRET, rateLimit: { enabled: false } },
              }),
          },
        },
        [
          new EmailModule(billingTemplates),
          new BillingModule({ stripe, ...options.libs }, options.catalog ?? billingCatalog),
          new AuthModule(),
        ]
      );
    } catch (error) {
      await pool.end();
      throw error;
    }
  })();
  const server = await new Promise<Server>((resolve) => {
    const listening = built.express.app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const visit = (
    host: string,
    path: string,
    options: { cookie?: string; origin?: string; method?: string; body?: unknown } = {}
  ) =>
    new Promise<Response>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path:
            path.startsWith("/trpc/") && options.body
              ? `${path}${path.includes("?") ? "&" : "?"}batch=1`
              : path,
          method: options.method ?? "GET",
          headers: {
            host,
            ...(options.cookie ? { cookie: options.cookie } : {}),
            ...(options.origin ? { origin: options.origin } : {}),
            ...(options.body ? { "content-type": "application/json" } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: Object.fromEntries(
                  Object.entries(res.headers).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value.join(", ") : (value ?? ""),
                  ])
                ),
              })
            )
          );
        }
      );
      req.on("error", reject);
      req.end(
        options.body
          ? JSON.stringify(
              path.startsWith("/trpc/")
                ? { "0": transformer.serialize(options.body) }
                : options.body
            )
          : undefined
      );
    });
  const login = async (id: string, userId = "person") => {
    const response = await visit(apiHost(id), "/api/auth/sign-in/email", {
      method: "POST",
      origin: `https://${id}.example.test`,
      body: { email: `${userId}@example.test`, password: "Original-Password-123" },
    });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  };
  const activate = async (cookie: string, org = "one") => {
    const response = await visit(apiHost("radar"), "/api/auth/get-session", { cookie });
    const body = z.object({ session: z.object({ id: z.string() }) }).parse(await response.json());
    await orm
      .update(authTables.sessions)
      .set({
        activeOrganizationId: `org_${org}`,
        activeOrganizationMemberId: `member_${org}`,
        activeOrganizationRole: "owner",
      })
      .where(eq(authTables.sessions.id, body.session.id));
    return body.session.id as string;
  };
  const complete = (index = 0) => {
    const id = `cs_test_${index + 1}`;
    const session = sessions.get(id)!;
    session.status = "complete";
    const params = creates[index];
    const customer = String(params.customer);
    const now = Math.floor(Date.now() / 1000);
    subscriptions.set(customer, {
      id: `sub_${id}`,
      customer,
      status: "active",
      items: {
        data: [
          {
            id: `si_${id}`,
            quantity: 1,
            price: {
              id: "price_usd",
              unit_amount: 3900,
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
    } as unknown as Stripe.Subscription);
    return String(params.success_url).replace("{CHECKOUT_SESSION_ID}", id);
  };
  return {
    built,
    pool,
    orm,
    visit,
    login,
    activate,
    apiHost,
    creates,
    sessions,
    subscriptions,
    retrieved,
    synced,
    complete,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await built.shutdown();
      await pool.end();
    },
  };
}
export const billingQuery = (name: string) =>
  `/trpc/billing.${name}?input=${encodeURIComponent(JSON.stringify(transformer.serialize({})))}`;
export async function readBillingTRPC(response: Response) {
  const result = z.object({ result: z.object({ data: z.string() }) }).parse(await response.json());
  return transformer.deserialize(result.result.data);
}
