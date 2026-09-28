import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import type {
  ResolvedStripePlans,
  StripePlan,
} from "@m5kdev/commons/modules/billing/billing.types";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import type { FunctionComponent } from "react";
import type Stripe from "stripe";
import { createBackendApp } from "../../../app";
import { createServiceActor } from "../../../base/base.actor";
import * as authTables from "../../auth/auth.db";
import { EmailModule } from "../../email/email.module";
import type { EmailTemplates } from "../../email/email.service";
import * as billingTables from "../billing.db";
import { BillingModule } from "../billing.module";
import type { BillingService } from "../billing.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const PRICE_ID = "price_usd_month";
const PRICE_USD_QUARTER = "price_usd_quarter";
const PRICE_PLN_MONTH = "price_pln_month";
const PRICE_TEAM_MONTH = "price_team_usd_month";
const PRICE_CAD_YEAR = "price_cad_year";
const CUSTOMER_ID = "cus_trial";
const ORG_ID = "org_trial";
const MEMBER_ID = "member_owner";
const USER_ID = "user_trial";
const USER_EMAIL = "pat@example.com";
const PORTAL_URL = "https://billing.stripe.com/p/session/test_portal";
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/test";
const FREE_FOREVER_COUPON = { id: "free_forever", name: "Free", percent_off: 100 };
const HALF_OFF_COUPON = { id: "half_off", name: "Half off", percent_off: 50 };

const Template: FunctionComponent<Record<string, unknown>> = ({ previewText }) =>
  previewText as never;

const requiredTemplates: EmailTemplates = {
  accountDeletion: { id: "account-deletion", react: Template },
  verification: { id: "verification", react: Template },
  waitlistConfirmation: { id: "waitlist-confirmation", react: Template },
  passwordReset: { id: "password-reset", react: Template },
  systemWaitlistNotification: { id: "system-waitlist-notification", react: Template },
  waitlistInvite: { id: "waitlist-invite", react: Template },
  waitlistUserInvite: { id: "waitlist-user-invite", react: Template },
  organizationInvite: { id: "organization-invite", react: Template },
};

const trialEndingTemplates: EmailTemplates = {
  ...requiredTemplates,
  trialEnding: {
    id: "trial-ending",
    subject: "trialEnding.subject",
    previewText: "trialEnding.previewText",
    react: Template,
  },
};

const plan: StripePlan = {
  name: "pro",
  products: {
    usd: {
      id: "prod_usd",
      defaultPriceId: PRICE_ID,
      prices: [
        { priceId: PRICE_ID, interval: "month", intervalCount: 1, unitAmount: 3900 },
        { priceId: PRICE_USD_QUARTER, interval: "month", intervalCount: 3, unitAmount: 9900 },
      ],
    },
    pln: {
      id: "prod_pln",
      defaultPriceId: PRICE_PLN_MONTH,
      prices: [
        { priceId: PRICE_PLN_MONTH, interval: "month", intervalCount: 1, unitAmount: 14900 },
      ],
    },
    cad: {
      id: "prod_cad",
      prices: [{ priceId: PRICE_CAD_YEAR, interval: "year", intervalCount: 1, unitAmount: 39000 }],
    },
  },
  freeTrial: { days: 7 },
};

function catalog(overrides: Partial<ResolvedStripePlans> = {}): ResolvedStripePlans {
  return {
    environment: "production",
    plans: [plan],
    trialPlanName: { usd: "pro", pln: "pro" },
    trialRequiresPaymentMethod: false,
    defaultCurrency: "usd",
    seatBilling: false,
    nonBillableRoleKeys: [],
    ...overrides,
  };
}

function periodFields(now: number) {
  return {
    current_period_start: now,
    current_period_end: now + 60 * 60 * 24 * 30,
  };
}

function createStripeStub(options: {
  subscriptionDefaultPaymentMethod?: string | null;
  customerDefaultPaymentMethod?: string | null;
  failCustomerCreate?: boolean;
  subscriptionStatus?: Stripe.Subscription.Status;
  quantity?: number;
  coupons?: Array<Partial<Stripe.Coupon> & { id: string }>;
}): Stripe & {
  state: {
    quantity: number;
    status: string;
    created: boolean;
    priceId: string;
    intervalPicked: boolean;
    discounts: string[];
    cancelAtPeriodEnd: boolean;
  };
} {
  const now = Math.floor(Date.now() / 1000);
  const state = {
    quantity: options.quantity ?? 1,
    status: options.subscriptionStatus ?? "trialing",
    created: false,
    priceId: PRICE_ID,
    intervalPicked: false,
    discounts: [] as string[],
    cancelAtPeriodEnd: false,
  };

  const subscriptionItem = () => ({
    id: "si_trial",
    quantity: state.quantity,
    ...periodFields(now),
    price: {
      id: state.priceId,
      unit_amount: 3900,
      recurring: {
        interval: "month" as const,
        interval_count: state.priceId === PRICE_USD_QUARTER ? 3 : 1,
      },
    },
  });

  const subscription = () => ({
    id: "sub_trial",
    customer: CUSTOMER_ID,
    status: state.status,
    default_payment_method: options.subscriptionDefaultPaymentMethod ?? null,
    items: { data: [subscriptionItem()] },
    discounts: state.discounts.map((coupon) => ({
      id: `di_${coupon}`,
      source: { type: "coupon", coupon },
    })),
    cancel_at_period_end: state.cancelAtPeriodEnd,
    cancel_at: null,
    canceled_at: state.status === "canceled" ? now : null,
    metadata: {
      organizationId: ORG_ID,
      intervalPicked: state.intervalPicked ? "true" : "false",
    },
    trial_start: now - 60 * 60 * 24 * 4,
    trial_end: now + 60 * 60 * 24 * 3,
    trial_settings: {
      end_behavior: { missing_payment_method: "cancel" as const },
    },
  });

  const couponData = (options.coupons ?? [FREE_FOREVER_COUPON]).map((coupon) => ({
    name: null,
    percent_off: null,
    amount_off: null,
    currency: null,
    duration: "forever",
    duration_in_months: null,
    valid: true,
    ...coupon,
  }));

  let createdCustomers = 0;
  const stripe = {
    state,
    subscriptions: {
      list: jest.fn().mockImplementation(async () => ({
        data: state.created ? [subscription()] : [],
      })),
      create: jest
        .fn()
        .mockImplementation(
          async (params: {
            items: Array<{ price?: string; quantity?: number }>;
            trial_period_days?: number;
            discounts?: Array<{ coupon?: string }>;
          }) => {
            if (options.failCustomerCreate) throw new Error("stripe down");
            state.created = true;
            state.quantity = params.items[0]?.quantity ?? 1;
            state.priceId = params.items[0]?.price ?? PRICE_ID;
            state.status = params.trial_period_days != null ? "trialing" : "active";
            state.intervalPicked = false;
            state.discounts = (params.discounts ?? [])
              .map((discount) => discount.coupon)
              .filter((coupon): coupon is string => Boolean(coupon));
            return subscription();
          }
        ),
      update: jest.fn().mockImplementation(
        async (
          _id: string,
          params: {
            items?: Array<{ price?: string; quantity?: number }>;
            metadata?: Record<string, string>;
            discounts?: Array<{ coupon?: string }> | string;
            cancel_at_period_end?: boolean;
          }
        ) => {
          state.quantity = params.items?.[0]?.quantity ?? state.quantity;
          if (params.items?.[0]?.price) state.priceId = params.items[0].price;
          if (params.metadata?.intervalPicked === "true") state.intervalPicked = true;
          if (params.discounts === "") {
            state.discounts = [];
          } else if (Array.isArray(params.discounts)) {
            state.discounts = params.discounts
              .map((discount) => discount.coupon)
              .filter((coupon): coupon is string => Boolean(coupon));
          }
          if (params.cancel_at_period_end != null) {
            state.cancelAtPeriodEnd = params.cancel_at_period_end;
          }
          return subscription();
        }
      ),
      cancel: jest.fn().mockImplementation(async () => {
        state.status = "canceled";
        return subscription();
      }),
    },
    customers: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockImplementation(async () => {
        if (options.failCustomerCreate) throw new Error("stripe down");
        createdCustomers += 1;
        return {
          id: createdCustomers === 1 ? CUSTOMER_ID : `cus_org_${createdCustomers}`,
          email: USER_EMAIL,
          deleted: false,
        };
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        email: USER_EMAIL,
        deleted: false,
        invoice_settings: {
          default_payment_method: options.customerDefaultPaymentMethod ?? null,
        },
      }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: CHECKOUT_URL }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: PORTAL_URL }),
      },
    },
    invoices: {
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    coupons: {
      list: jest.fn().mockImplementation(() => ({ autoPagingToArray: async () => couponData })),
      retrieve: jest.fn().mockImplementation(async (id: string) => {
        const coupon = couponData.find((item) => item.id === id);
        if (coupon) return coupon;
        const error = new Error(`No such coupon: '${id}'`) as Error & { code: string };
        error.code = "resource_missing";
        throw error;
      }),
    },
  };

  return stripe as unknown as Stripe & { state: typeof state };
}

function trialWillEndEvent(
  id: string,
  subscription?: {
    defaultPaymentMethod?: string | null;
  }
): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    type: "customer.subscription.trial_will_end",
    data: {
      object: {
        customer: CUSTOMER_ID,
        default_payment_method: subscription?.defaultPaymentMethod ?? null,
        trial_end: now + 60 * 60 * 24 * 3,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
      },
    },
  } as Stripe.Event;
}

function trialConvertedEvent(): Stripe.Event {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "evt_convert",
    type: "customer.subscription.updated",
    data: {
      previous_attributes: { status: "trialing" },
      object: {
        id: "sub_trial",
        customer: CUSTOMER_ID,
        status: "active",
        items: {
          data: [
            {
              id: "si_trial",
              quantity: 5,
              ...periodFields(now),
              price: { id: PRICE_ID, unit_amount: 3900, recurring: { interval: "month" } },
            },
          ],
        },
        discounts: [],
        cancel_at_period_end: false,
        metadata: {},
      },
    },
  } as unknown as Stripe.Event;
}

async function createTables(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      role TEXT,
      banned INTEGER,
      ban_reason TEXT,
      ban_expires INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT DEFAULT '[]',
      locale TEXT
    );
  `);
  await client.execute(`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      logo TEXT,
      type TEXT,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      onboarding INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      flags TEXT DEFAULT '[]',
      locale TEXT,
      currency TEXT,
      stripe_customer_id TEXT UNIQUE,
      stripe_sandbox_customer_id TEXT UNIQUE
    );
  `);
  await client.execute(`
    CREATE TABLE members (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL,
      user_id TEXT,
      email TEXT,
      name TEXT NOT NULL DEFAULT '',
      image TEXT,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT DEFAULT '[]'
    );
  `);
  await client.execute(`
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER,
      plan TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      status TEXT NOT NULL,
      period_start INTEGER,
      period_end INTEGER,
      price_id TEXT,
      interval TEXT,
      interval_count INTEGER,
      interval_picked INTEGER DEFAULT 0,
      unit_amount INTEGER,
      discounts TEXT,
      cancel_at_period_end INTEGER,
      cancel_at INTEGER,
      canceled_at INTEGER,
      seats INTEGER,
      member_id TEXT,
      trial_start INTEGER,
      trial_end INTEGER
    );
  `);
}

async function seedOrg(client: Client, memberCount = 1): Promise<void> {
  const orm = drizzle(client, {
    schema: {
      users: authTables.users,
      organizations: authTables.organizations,
      members: authTables.members,
    },
  });
  await orm.insert(authTables.users).values({
    id: USER_ID,
    name: "Pat",
    email: USER_EMAIL,
    emailVerified: true,
  });
  await orm.insert(authTables.organizations).values({
    id: ORG_ID,
    name: "Acme",
    currency: "usd",
  });
  for (let i = 0; i < memberCount; i += 1) {
    await orm.insert(authTables.members).values({
      id: i === 0 ? MEMBER_ID : `member_${i}`,
      organizationId: ORG_ID,
      userId: i === 0 ? USER_ID : null,
      email: i === 0 ? USER_EMAIL : `member${i}@example.com`,
      name: `Member ${i}`,
      role: i === 0 ? "owner" : "member",
    });
  }
}

async function bootBilling(options: {
  client: Client;
  templates: EmailTemplates;
  outputDirectory: string;
  stripe: Stripe;
  catalog?: ResolvedStripePlans;
}): Promise<BillingService> {
  const built = createBackendApp(
    {
      db: { client: options.client },
      schema: { ...authTables, ...billingTables },
      email: {
        mode: "store",
        from: "no-reply@example.com",
        outputDirectory: options.outputDirectory,
      },
    },
    [
      new EmailModule(options.templates),
      new BillingModule({ stripe: options.stripe }, options.catalog ?? catalog()),
    ] as const
  );

  return built.modules.billing.services.billing;
}

function memberCtx() {
  return {
    actor: createServiceActor({
      userId: USER_ID,
      userRole: "user",
      organizationId: ORG_ID,
      organizationRole: "member",
      memberId: MEMBER_ID,
    }),
    user: { id: USER_ID, email: USER_EMAIL, name: "Pat" },
    session: { id: "sess", userId: USER_ID, activeOrganizationId: ORG_ID },
  } as never;
}

function ownerCtx() {
  return {
    actor: createServiceActor({
      userId: USER_ID,
      userRole: "user",
      organizationId: ORG_ID,
      organizationRole: "owner",
      memberId: MEMBER_ID,
    }),
    user: { id: USER_ID, email: USER_EMAIL, name: "Pat" },
    session: { id: "sess", userId: USER_ID, activeOrganizationId: ORG_ID },
  } as never;
}

function adminCtx() {
  return {
    actor: createServiceActor({
      userId: "admin-1",
      userRole: "admin",
    }),
    user: { id: "admin-1", email: "admin@example.com", name: "Admin" },
  } as never;
}

function invoicePaymentFailedEvent(): Stripe.Event {
  return {
    id: "evt_invoice_failed",
    type: "invoice.payment_failed",
    data: {
      object: {
        customer: CUSTOMER_ID,
        subscription: "sub_trial",
      },
    },
  } as unknown as Stripe.Event;
}

describe("BillingService.processEvent trial_will_end", () => {
  let client: Client;
  let outputDirectory: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-billing-email-"));
    await createTables(client);
    await seedOrg(client);
  });

  afterEach(async () => {
    await client.close?.();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  async function linkCustomer(
    stripe: ReturnType<typeof createStripeStub>
  ): Promise<BillingService> {
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    return bootBilling({
      client,
      templates: trialEndingTemplates,
      outputDirectory,
      stripe,
    });
  }

  it("emails the Billing Portal URL when Stripe would cancel, and still syncs", async () => {
    const stripe = createStripeStub({});
    const billing = await linkCustomer(stripe);

    const result = await billing.processEvent(trialWillEndEvent("evt_trial_1"));

    expect(result.isOk()).toBe(true);

    const files = await fs.readdir(outputDirectory);
    expect(files).toHaveLength(1);
    const first = files[0];
    if (!first) throw new Error("Expected trial-ending email to be stored");

    const payload = JSON.parse(await fs.readFile(path.join(outputDirectory, first), "utf8")) as {
      to: string | string[];
      templateId: string;
      props: { url?: string };
    };

    expect(payload.templateId).toBe("trial-ending");
    expect(payload.to).toEqual(USER_EMAIL);
    expect(payload.props.url).toBe(PORTAL_URL);

    const orm = drizzle(client, { schema: billingTables });
    const rows = await orm
      .select()
      .from(billingTables.subscriptions)
      .where(eq(billingTables.subscriptions.referenceId, ORG_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("trialing");
  });

  it("does not email when a usable default payment method exists, and still syncs", async () => {
    const stripe = createStripeStub({ subscriptionDefaultPaymentMethod: "pm_card" });
    const billing = await linkCustomer(stripe);

    const result = await billing.processEvent(
      trialWillEndEvent("evt_trial_pm", { defaultPaymentMethod: "pm_card" })
    );

    expect(result.isOk()).toBe(true);
    expect(await fs.readdir(outputDirectory)).toHaveLength(0);
  });

  it("succeeds and skips send when the trial-ending template is unregistered", async () => {
    const stripe = createStripeStub({});
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.processEvent(trialWillEndEvent("evt_trial_no_template"));

    expect(result.isOk()).toBe(true);
    expect(await fs.readdir(outputDirectory)).toHaveLength(0);
  });

  it("sends once per Stripe event id and again for a later distinct id", async () => {
    const stripe = createStripeStub({});
    const billing = await linkCustomer(stripe);

    const first = await billing.processEvent(trialWillEndEvent("evt_trial_same"));
    const retry = await billing.processEvent(trialWillEndEvent("evt_trial_same"));
    const later = await billing.processEvent(trialWillEndEvent("evt_trial_extended"));

    expect(first.isOk()).toBe(true);
    expect(retry.isOk()).toBe(true);
    expect(later.isOk()).toBe(true);
    expect(await fs.readdir(outputDirectory)).toHaveLength(2);
  });
});

describe("BillingService Organization paywall", () => {
  let client: Client;
  let outputDirectory: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-billing-org-"));
    await createTables(client);
    await seedOrg(client);
  });

  afterEach(async () => {
    await client.close?.();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  it("throws when a Plan is missing the defaultCurrency Product", async () => {
    const stripe = createStripeStub({});
    const broken: StripePlan = {
      name: "pro",
      products: {
        pln: {
          id: "prod_pln",
          prices: [
            { priceId: PRICE_PLN_MONTH, interval: "month", intervalCount: 1, unitAmount: 14900 },
          ],
        },
      },
    };
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema: { ...authTables, ...billingTables },
          email: { mode: "store", from: "no-reply@example.com", outputDirectory },
        },
        [
          new EmailModule(requiredTemplates),
          new BillingModule({ stripe }, catalog({ plans: [broken], trialPlanName: {} })),
        ] as const
      )
    ).toThrow("Plan pro is missing Product for defaultCurrency");
  });

  it("throws when card-off Trial Plan has no default Price", async () => {
    const stripe = createStripeStub({});
    const yearlyOnly: StripePlan = {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          prices: [{ priceId: PRICE_ID, interval: "year", intervalCount: 1, unitAmount: 34800 }],
        },
      },
    };
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema: { ...authTables, ...billingTables },
          email: { mode: "store", from: "no-reply@example.com", outputDirectory },
        },
        [
          new EmailModule(requiredTemplates),
          new BillingModule(
            { stripe },
            catalog({ plans: [yearlyOnly], trialPlanName: { usd: "pro" } })
          ),
        ] as const
      )
    ).toThrow("Trial Plan pro requires a default Price for usd");
  });

  it("throws when the Trial Plan name is missing from the catalog", async () => {
    const stripe = createStripeStub({});
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema: { ...authTables, ...billingTables },
          email: { mode: "store", from: "no-reply@example.com", outputDirectory },
        },
        [
          new EmailModule(requiredTemplates),
          new BillingModule({ stripe }, catalog({ trialPlanName: { usd: "enterprise" } })),
        ] as const
      )
    ).toThrow("Trial Plan enterprise not found");
  });

  it("boots card-required Trial without a default Price", async () => {
    const stripe = createStripeStub({});
    const noDefault: StripePlan = {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          prices: [{ priceId: PRICE_ID, interval: "year", intervalCount: 1, unitAmount: 34800 }],
        },
      },
      freeTrial: { days: 7 },
    };
    expect(() =>
      createBackendApp(
        {
          db: { client },
          schema: { ...authTables, ...billingTables },
          email: { mode: "store", from: "no-reply@example.com", outputDirectory },
        },
        [
          new EmailModule(requiredTemplates),
          new BillingModule(
            { stripe },
            catalog({
              plans: [noDefault],
              trialPlanName: { usd: "pro" },
              trialRequiresPaymentMethod: true,
            })
          ),
        ] as const
      )
    ).not.toThrow();
  });

  it("creates an Organization-keyed Trial Subscription", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
      name: "Pat",
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);

    const accessible = await billing.getActiveSubscription(memberCtx());
    expect(accessible.isOk()).toBe(true);
    expect(accessible._unsafeUnwrap()?.referenceId).toBe(ORG_ID);
    expect(accessible._unsafeUnwrap()?.status).toBe("trialing");
    expect(accessible._unsafeUnwrap()?.seats).toBe(1);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ price: PRICE_ID, quantity: 1 }],
        trial_period_days: 7,
      })
    );
  });

  it("does not fail Organization create when Stripe is down", async () => {
    const stripe = createStripeStub({ failCustomerCreate: true });
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(false);

    const accessible = await billing.getActiveSubscription(memberCtx());
    expect(accessible._unsafeUnwrap()).toBeNull();
  });

  it("refuses Checkout while a Trial exists", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const checkout = await billing.createCheckoutSession(
      { priceId: PRICE_ID },
      {
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        organizationRole: "owner",
        email: USER_EMAIL,
      }
    );
    expect(checkout.isErr()).toBe(true);
    if (checkout.isErr()) expect(checkout.error.code).toBe("CONFLICT");
  });

  it("refuses Checkout and Billing Portal for non-Owners", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const checkout = await billing.createCheckoutSession(
      { priceId: PRICE_ID },
      {
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        organizationRole: "admin",
        email: USER_EMAIL,
      }
    );
    expect(checkout.isErr()).toBe(true);
    if (checkout.isErr()) expect(checkout.error.code).toBe("FORBIDDEN");
  });

  it("treats past_due as access", async () => {
    const stripe = createStripeStub({ subscriptionStatus: "past_due" });
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });
    await billing.syncStripeData({ customerId: CUSTOMER_ID });

    const accessible = await billing.getActiveSubscription(memberCtx());
    expect(accessible._unsafeUnwrap()?.status).toBe("past_due");
  });

  it("ignores Membership count when Seat billing is off", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const adjusted = await billing.adjustBillableSeats({
      organizationId: ORG_ID,
      role: "member",
      delta: 1,
    });
    expect(adjusted.isOk()).toBe(true);
    expect(adjusted._unsafeUnwrap()).toBe(false);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("blocks Trial invites above freeTrial.seats when Seat billing is on", async () => {
    const seatedPlan: StripePlan = {
      ...plan,
      freeTrial: { days: 14, seats: 1 },
    };
    const stripe = createStripeStub({ quantity: 1 });
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const adjusted = await billing.adjustBillableSeats({
      organizationId: ORG_ID,
      role: "member",
      delta: 1,
    });
    expect(adjusted.isErr()).toBe(true);
    if (adjusted.isErr()) expect(adjusted.error.code).toBe("FORBIDDEN");
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("refuses billed Membership increases while past_due", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({ subscriptionStatus: "past_due", quantity: 1 });
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });
    await billing.syncStripeData({ customerId: CUSTOMER_ID });

    const adjusted = await billing.adjustBillableSeats({
      organizationId: ORG_ID,
      role: "member",
      delta: 1,
    });
    expect(adjusted.isErr()).toBe(true);
    if (adjusted.isErr()) expect(adjusted.error.code).toBe("FORBIDDEN");
  });

  it("snaps Stripe quantity to billable Memberships when Trial converts", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({ quantity: 5, subscriptionStatus: "active" });
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });

    const result = await billing.processEvent(trialConvertedEvent());
    expect(result.isOk()).toBe(true);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_trial",
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: 1 })],
      })
    );
  });

  it("cancels the Stripe Subscription when the Organization is deleted", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const canceled = await billing.cancelOrganizationSubscription({ organizationId: ORG_ID });
    expect(canceled.isOk()).toBe(true);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_trial");
  });

  it("uses freeTrial.seats as Trial Stripe quantity when Seat billing is on", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });

    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ price: PRICE_ID, quantity: 5 }],
      })
    );
  });

  it("does not change Stripe quantity for Trial decreases when Seat billing is on", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({ quantity: 5 });
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const adjusted = await billing.adjustBillableSeats({
      organizationId: ORG_ID,
      role: "member",
      delta: -1,
    });
    expect(adjusted.isOk()).toBe(true);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("updates Stripe quantity before a paid Membership increase", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({ subscriptionStatus: "active", quantity: 1 });
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });
    await billing.syncStripeData({ customerId: CUSTOMER_ID });

    const adjusted = await billing.adjustBillableSeats({
      organizationId: ORG_ID,
      role: "member",
      delta: 1,
    });
    expect(adjusted.isOk()).toBe(true);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_trial",
      expect.objectContaining({
        items: [expect.objectContaining({ quantity: 2 })],
      })
    );
  });

  it("Checkouts quantity 1 when Seat billing is off and there is no Subscription", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({ trialPlanName: {} }),
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const checkout = await billing.createCheckoutSession(
      { priceId: PRICE_ID },
      {
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        organizationRole: "owner",
        email: USER_EMAIL,
      }
    );
    expect(checkout.isOk()).toBe(true);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        metadata: { organizationId: ORG_ID, memberId: MEMBER_ID },
        subscription_data: {
          metadata: { organizationId: ORG_ID, memberId: MEMBER_ID },
        },
      })
    );
  });

  it("upserts the Organization Subscription instead of inserting a duplicate after cancel", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    await billing.cancelOrganizationSubscription({ organizationId: ORG_ID });

    const deleted = await billing.processEvent({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: { object: { customer: CUSTOMER_ID, id: "sub_trial" } },
    } as Stripe.Event);
    expect(deleted.isOk()).toBe(true);

    const orm = drizzle(client, { schema: { subscriptions: billingTables.subscriptions } });
    const rows = await orm.select().from(billingTables.subscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("canceled");
    expect(rows[0]?.referenceId).toBe(ORG_ID);
  });

  it("creates a distinct Stripe Customer per Organization", async () => {
    const stripe = createStripeStub({});
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm.insert(authTables.organizations).values({
      id: "org_other",
      name: "Other",
    });
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({ trialPlanName: {} }),
    });

    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    await billing.createOrganizationHook({
      organizationId: "org_other",
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    expect(stripe.customers.create).toHaveBeenCalledTimes(2);
    expect(stripe.customers.list).not.toHaveBeenCalled();
  });

  it("does not block Membership changes when Seat billing is on and there is no Subscription", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });

    const adjusted = await billing.adjustBillableSeats({
      organizationId: ORG_ID,
      role: "member",
      delta: 1,
    });
    expect(adjusted.isOk()).toBe(true);
    expect(adjusted._unsafeUnwrap()).toBe(false);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("does not change Stripe quantity when a Role change stays billable", async () => {
    const seatedPlan: StripePlan = { ...plan, freeTrial: { days: 14, seats: 5 } };
    const stripe = createStripeStub({ subscriptionStatus: "active", quantity: 2 });
    stripe.state.created = true;
    const orm = drizzle(client, {
      schema: { organizations: authTables.organizations, members: authTables.members },
    });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    await orm.insert(authTables.members).values({
      id: "member_admin",
      organizationId: ORG_ID,
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    });
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [seatedPlan],
        seatBilling: true,
      }),
    });
    await billing.syncStripeData({ customerId: CUSTOMER_ID });

    const adjusted = await billing.adjustBillableSeatsForRoleChange({
      organizationId: ORG_ID,
      fromRole: "admin",
      toRole: "member",
    });
    expect(adjusted.isOk()).toBe(true);
    expect(adjusted._unsafeUnwrap()).toBe(false);
    expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it("starts Trial on the default Price of the Organization currency", async () => {
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ currency: "pln" })
      .where(eq(authTables.organizations.id, ORG_ID));
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    expect(result.isOk()).toBe(true);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: PRICE_PLN_MONTH })],
        trial_period_days: 7,
      })
    );
  });

  it("creates Trial on a yearly default Price", async () => {
    const yearlyPlan: StripePlan = {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          defaultPriceId: PRICE_ID,
          prices: [{ priceId: PRICE_ID, interval: "year", intervalCount: 1, unitAmount: 34800 }],
        },
      },
      freeTrial: { days: 15 },
    };
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({ plans: [yearlyPlan], trialPlanName: { usd: "pro" } }),
    });

    const result = await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    expect(result.isOk()).toBe(true);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ price: PRICE_ID, quantity: 1 }],
        trial_period_days: 15,
      })
    );
  });

  it("skips Trial when the Organization currency has no Trial Plan", async () => {
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ currency: "cad" })
      .where(eq(authTables.organizations.id, ORG_ID));
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("does not create Trial at Organization create when Trial requires a payment method", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({ trialRequiresPaymentMethod: true }),
    });

    const result = await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe(true);
    expect(stripe.customers.create).toHaveBeenCalled();
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();

    const accessible = await billing.getActiveSubscription(memberCtx());
    expect(accessible._unsafeUnwrap()).toBeNull();
  });

  it("Checkouts the default Trial Price with a card when Trial requires a payment method", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({ trialRequiresPaymentMethod: true }),
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const checkout = await billing.createCheckoutSession(
      { priceId: PRICE_USD_QUARTER },
      {
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        organizationRole: "owner",
        email: USER_EMAIL,
      }
    );
    expect(checkout.isOk()).toBe(true);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: "always",
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
          metadata: { organizationId: ORG_ID, memberId: MEMBER_ID },
        }),
      })
    );
  });

  it("Checkouts the requested Trial Price with a card when no default Price is set", async () => {
    const noDefault: StripePlan = {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          prices: [
            { priceId: PRICE_ID, interval: "month", intervalCount: 1, unitAmount: 3900 },
            { priceId: PRICE_USD_QUARTER, interval: "month", intervalCount: 3, unitAmount: 9900 },
          ],
        },
      },
      freeTrial: { days: 7 },
    };
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [noDefault],
        trialPlanName: { usd: "pro" },
        trialRequiresPaymentMethod: true,
      }),
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const checkout = await billing.createCheckoutSession(
      { priceId: PRICE_USD_QUARTER },
      {
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        organizationRole: "owner",
        email: USER_EMAIL,
      }
    );
    expect(checkout.isOk()).toBe(true);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_collection: "always",
        line_items: [{ price: PRICE_USD_QUARTER, quantity: 1 }],
        subscription_data: expect.objectContaining({
          trial_period_days: 7,
        }),
      })
    );
  });

  it("refuses card-required Checkout of a Price from a different Plan", async () => {
    const otherPlan: StripePlan = {
      name: "team",
      products: {
        usd: {
          id: "prod_team_usd",
          prices: [
            { priceId: PRICE_TEAM_MONTH, interval: "month", intervalCount: 1, unitAmount: 9900 },
          ],
        },
      },
    };
    const noDefault: StripePlan = {
      name: "pro",
      products: {
        usd: {
          id: "prod_usd",
          prices: [{ priceId: PRICE_ID, interval: "month", intervalCount: 1, unitAmount: 3900 }],
        },
      },
      freeTrial: { days: 7 },
    };
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog({
        plans: [noDefault, otherPlan],
        trialPlanName: { usd: "pro" },
        trialRequiresPaymentMethod: true,
      }),
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const checkout = await billing.createCheckoutSession(
      { priceId: PRICE_TEAM_MONTH },
      {
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        organizationRole: "owner",
        email: USER_EMAIL,
      }
    );
    expect(checkout.isErr()).toBe(true);
    if (checkout.isErr()) expect(checkout.error.code).toBe("NOT_FOUND");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("keeps a Trial that converts to paid", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const converted = await billing.processEvent(trialConvertedEvent());
    expect(converted.isOk()).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("resolves a Plan from a quarterly Price on webhook sync", async () => {
    const stripe = createStripeStub({});
    stripe.state.created = true;
    stripe.state.priceId = PRICE_USD_QUARTER;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const synced = await billing.syncStripeData({ customerId: CUSTOMER_ID });
    expect(synced.isOk()).toBe(true);
    const accessible = await billing.getActiveSubscription(memberCtx());
    expect(accessible._unsafeUnwrap()?.plan).toBe("pro");
    expect(accessible._unsafeUnwrap()?.priceId).toBe(PRICE_USD_QUARTER);
    expect(accessible._unsafeUnwrap()?.intervalCount).toBe(3);
  });

  it("resolves a Plan from a Price on a second Product", async () => {
    const stripe = createStripeStub({});
    stripe.state.created = true;
    stripe.state.priceId = PRICE_PLN_MONTH;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID, currency: "pln" })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
    });

    const synced = await billing.syncStripeData({ customerId: CUSTOMER_ID });
    expect(synced.isOk()).toBe(true);
    const accessible = await billing.getActiveSubscription(memberCtx());
    expect(accessible._unsafeUnwrap()?.plan).toBe("pro");
    expect(accessible._unsafeUnwrap()?.priceId).toBe(PRICE_PLN_MONTH);
  });
});

describe("BillingService Billing Module admin", () => {
  let client: Client;
  let outputDirectory: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-billing-admin-"));
    await createTables(client);
    await seedOrg(client);
  });

  afterEach(async () => {
    await client.close?.();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  async function linkCustomer(): Promise<void> {
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
  }

  function boot(stripe: Stripe, overrides: Partial<ResolvedStripePlans> = {}) {
    return bootBilling({
      client,
      templates: requiredTemplates,
      outputDirectory,
      stripe,
      catalog: catalog(overrides),
    });
  }

  it("refuses a full-price Subscription when the Customer has no payment method", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const refused = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_USD_QUARTER },
      adminCtx()
    );
    expect(refused._unsafeUnwrapErr().code).toBe("BAD_REQUEST");
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("refuses a full-price Subscription when the linked Customer has no card", async () => {
    await linkCustomer();
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const refused = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID },
      adminCtx()
    );
    expect(refused._unsafeUnwrapErr().code).toBe("BAD_REQUEST");
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("starts an Admin Trial with billable Membership quantity when Seat billing is on", async () => {
    const orm = drizzle(client, { schema: { members: authTables.members } });
    await orm.insert(authTables.members).values([
      { id: "member_a", organizationId: ORG_ID, email: "a@example.com", name: "A", role: "member" },
      { id: "member_b", organizationId: ORG_ID, email: "b@example.com", name: "B", role: "member" },
    ]);
    const stripe = createStripeStub({});
    const billing = await boot(stripe, {
      plans: [{ ...plan, freeTrial: { days: 7, seats: 5 } }],
      seatBilling: true,
    });

    const created = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_USD_QUARTER, trialDays: 21 },
      adminCtx()
    );
    expect(created.isOk()).toBe(true);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ price: PRICE_USD_QUARTER, quantity: 3 }],
        trial_period_days: 21,
      })
    );
  });

  it("refuses a partial Coupon when the Customer has no payment method", async () => {
    const stripe = createStripeStub({ coupons: [HALF_OFF_COUPON] });
    const billing = await boot(stripe);

    const refused = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "half_off" },
      adminCtx()
    );
    expect(refused._unsafeUnwrapErr().code).toBe("BAD_REQUEST");
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("creates a full-price Subscription when the Customer has a card", async () => {
    await linkCustomer();
    const stripe = createStripeStub({ customerDefaultPaymentMethod: "pm_card" });
    const billing = await boot(stripe);

    const created = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_USD_QUARTER },
      adminCtx()
    );
    expect(created.isOk()).toBe(true);

    expect(stripe.customers.create).not.toHaveBeenCalled();
    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.status).toBe("active");
    expect(accessible?.priceId).toBe(PRICE_USD_QUARTER);
    expect(accessible?.memberId).toBe(MEMBER_ID);
    expect(accessible?.discounts ?? []).toHaveLength(0);
  });

  it("creates a 100% Coupon Subscription when the Customer has no payment method", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const created = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "free_forever" },
      adminCtx()
    );
    expect(created.isOk()).toBe(true);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ trial_period_days: expect.anything() })
    );
    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.status).toBe("active");
    expect(accessible?.discounts).toEqual(["free_forever"]);
  });

  it("starts an Admin Trial with entered days on any catalog Price without a card", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const created = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_USD_QUARTER, trialDays: 30 },
      adminCtx()
    );
    expect(created.isOk()).toBe(true);
    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trial_period_days: 30,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      })
    );
    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.status).toBe("trialing");
    expect(accessible?.priceId).toBe(PRICE_USD_QUARTER);
  });

  it("refuses a Trial and a Coupon together", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const refused = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, trialDays: 14, couponId: "free_forever" },
      adminCtx()
    );
    expect(refused._unsafeUnwrapErr().code).toBe("BAD_REQUEST");
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("lists the catalog environment and the Trial Plan days for each Organization", async () => {
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .insert(authTables.organizations)
      .values({ id: "org_cad", name: "Maple", currency: "cad" });
    const billing = await boot(createStripeStub({}), { environment: "sandbox" });

    const listed = (await billing.listAdminOrganizationBilling({}, adminCtx()))._unsafeUnwrap();
    expect(listed.environment).toBe("sandbox");
    expect(listed.rows.find((row) => row.organizationId === ORG_ID)?.defaultTrialDays).toBe(7);
    expect(
      listed.rows.find((row) => row.organizationId === "org_cad")?.defaultTrialDays
    ).toBeNull();
  });

  it("creates a Subscription with a Coupon and lists that Coupon on the Organization", async () => {
    await linkCustomer();
    const stripe = createStripeStub({
      customerDefaultPaymentMethod: "pm_card",
      coupons: [
        {
          id: "half_off",
          name: "Half off",
          percent_off: 50,
          duration: "repeating",
          duration_in_months: 3,
        },
      ],
    });
    const billing = await boot(stripe);

    const created = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "half_off" },
      adminCtx()
    );
    expect(created.isOk()).toBe(true);

    const listed = (await billing.listAdminOrganizationBilling({}, adminCtx()))._unsafeUnwrap();
    const row = listed.rows.find((item) => item.organizationId === ORG_ID);
    expect(row?.stripeCustomerId).toBe(CUSTOMER_ID);
    expect(row?.openSubscription).toBe(true);
    expect(row?.subscription?.status).toBe("active");
    expect(row?.coupon).toEqual({
      id: "half_off",
      name: "Half off",
      percentOff: 50,
      amountOff: null,
      currency: null,
      duration: "repeating",
      durationInMonths: 3,
      valid: true,
    });
  });

  it("shows an attached Coupon that Stripe no longer marks valid", async () => {
    await linkCustomer();
    const stripe = createStripeStub({
      customerDefaultPaymentMethod: "pm_card",
      coupons: [{ id: "launch", name: "Launch", percent_off: 20, valid: false }],
    });
    const billing = await boot(stripe);
    await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "launch" },
      adminCtx()
    );

    const listed = (await billing.listAdminOrganizationBilling({}, adminCtx()))._unsafeUnwrap();
    expect(listed.rows[0]?.coupon?.name).toBe("Launch");
    expect(listed.rows[0]?.coupon?.percentOff).toBe(20);
  });

  it("lists Coupons from the Stripe account", async () => {
    const stripe = createStripeStub({
      coupons: [
        { id: "free_forever", percent_off: 100 },
        { id: "expired", percent_off: 10, valid: false },
      ],
    });
    const billing = await boot(stripe);

    const coupons = (await billing.listAdminCoupons(undefined, adminCtx()))._unsafeUnwrap();
    expect(coupons.map((coupon) => coupon.id)).toEqual(["free_forever"]);
  });

  it("refuses a Price until Organization currency is set, then creates on that currency", async () => {
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ currency: null })
      .where(eq(authTables.organizations.id, ORG_ID));
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const refused = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_PLN_MONTH },
      adminCtx()
    );
    expect(refused._unsafeUnwrapErr().code).toBe("BAD_REQUEST");

    const set = await billing.setAdminOrganizationCurrency(
      { organizationId: ORG_ID, currency: "pln" },
      adminCtx()
    );
    expect(set.isOk()).toBe(true);

    const created = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_PLN_MONTH, trialDays: 14 },
      adminCtx()
    );
    expect(created.isOk()).toBe(true);
    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.priceId).toBe(PRICE_PLN_MONTH);
  });

  it("refuses to change an Organization currency that is already set", async () => {
    const billing = await boot(createStripeStub({}));

    const set = await billing.setAdminOrganizationCurrency(
      { organizationId: ORG_ID, currency: "pln" },
      adminCtx()
    );
    expect(set._unsafeUnwrapErr().code).toBe("CONFLICT");
  });

  it("refuses a currency that differs from the Owner's other live Organizations", async () => {
    const orm = drizzle(client, {
      schema: { organizations: authTables.organizations, members: authTables.members },
    });
    await orm
      .update(authTables.organizations)
      .set({ currency: null })
      .where(eq(authTables.organizations.id, ORG_ID));
    await orm
      .insert(authTables.organizations)
      .values({ id: "org_other", name: "Other", currency: "usd" });
    await orm.insert(authTables.members).values({
      id: "member_other_owner",
      organizationId: "org_other",
      userId: USER_ID,
      email: USER_EMAIL,
      name: "Pat",
      role: "owner",
    });
    const billing = await boot(createStripeStub({}));

    const mismatch = await billing.setAdminOrganizationCurrency(
      { organizationId: ORG_ID, currency: "pln" },
      adminCtx()
    );
    expect(mismatch._unsafeUnwrapErr().code).toBe("BAD_REQUEST");

    const matched = await billing.setAdminOrganizationCurrency(
      { organizationId: ORG_ID, currency: "usd" },
      adminCtx()
    );
    expect(matched.isOk()).toBe(true);
  });

  it("refuses a Price that does not match Organization currency", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    const refused = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_PLN_MONTH },
      adminCtx()
    );
    expect(refused._unsafeUnwrapErr().code).toBe("NOT_FOUND");
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it("applies a Coupon to a Trial without changing Price and refuses a second Subscription", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);
    await billing.createOrganizationHook({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      email: USER_EMAIL,
    });

    const second = await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_USD_QUARTER },
      adminCtx()
    );
    expect(second._unsafeUnwrapErr().code).toBe("CONFLICT");

    const applied = await billing.applyAdminCoupon(
      { organizationId: ORG_ID, couponId: "free_forever" },
      adminCtx()
    );
    expect(applied.isOk()).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();

    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.status).toBe("trialing");
    expect(accessible?.priceId).toBe(PRICE_ID);
    expect(accessible?.discounts).toEqual(["free_forever"]);
  });

  it("replaces the Coupon instead of stacking a second one", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);
    await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "free_forever" },
      adminCtx()
    );

    await billing.applyAdminCoupon({ organizationId: ORG_ID, couponId: "half_off" }, adminCtx());

    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.discounts).toEqual(["half_off"]);
  });

  it("removes the Coupon without canceling when there is no payment method", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);
    await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "free_forever" },
      adminCtx()
    );

    const removed = await billing.removeAdminCoupon({ organizationId: ORG_ID }, adminCtx());
    expect(removed.isOk()).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();

    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.status).toBe("active");
    expect(accessible?.discounts ?? []).toHaveLength(0);
  });

  it("keeps past_due access when an invoice fails and there is no payment method", async () => {
    const stripe = createStripeStub({ subscriptionStatus: "past_due" });
    stripe.state.created = true;
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: CUSTOMER_ID })
      .where(eq(authTables.organizations.id, ORG_ID));
    const billing = await boot(stripe);

    const processed = await billing.processEvent(invoicePaymentFailedEvent());
    expect(processed.isOk()).toBe(true);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();

    const accessible = (await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap();
    expect(accessible?.status).toBe("past_due");
  });

  it("cancels at period end or immediately", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);
    await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "free_forever" },
      adminCtx()
    );

    const periodEnd = await billing.cancelAdminSubscription(
      { organizationId: ORG_ID, when: "period_end" },
      adminCtx()
    );
    expect(periodEnd.isOk()).toBe(true);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_trial",
      expect.objectContaining({ cancel_at_period_end: true })
    );

    const immediate = await billing.cancelAdminSubscription(
      { organizationId: ORG_ID, when: "immediate" },
      adminCtx()
    );
    expect(immediate.isOk()).toBe(true);
    expect((await billing.getActiveSubscription(memberCtx()))._unsafeUnwrap()).toBeNull();
  });

  it("creates Seat billing quantity from billable Memberships", async () => {
    const orm = drizzle(client, { schema: { members: authTables.members } });
    await orm.insert(authTables.members).values([
      {
        id: "member_1",
        organizationId: ORG_ID,
        email: "m1@example.com",
        name: "M1",
        role: "member",
      },
      {
        id: "member_2",
        organizationId: ORG_ID,
        email: "m2@example.com",
        name: "M2",
        role: "member",
      },
    ]);
    const stripe = createStripeStub({});
    const billing = await boot(stripe, {
      plans: [{ ...plan, freeTrial: { days: 7, seats: 5 } }],
      seatBilling: true,
    });

    await billing.createAdminSubscription(
      { organizationId: ORG_ID, priceId: PRICE_ID, couponId: "free_forever" },
      adminCtx()
    );

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({ items: [{ price: PRICE_ID, quantity: 3 }] })
    );
  });

  it("creates a sandbox Customer without overriding the production Customer", async () => {
    const orm = drizzle(client, { schema: { organizations: authTables.organizations } });
    await orm
      .update(authTables.organizations)
      .set({ stripeCustomerId: "cus_live" })
      .where(eq(authTables.organizations.id, ORG_ID));
    const stripe = createStripeStub({});
    const billing = await boot(stripe, { environment: "sandbox" });

    const listedBefore = (
      await billing.listAdminOrganizationBilling({}, adminCtx())
    )._unsafeUnwrap();
    expect(listedBefore.rows[0]?.stripeCustomerId).toBeNull();

    const created = await billing.createAdminCustomer({ organizationId: ORG_ID }, adminCtx());
    expect(created.isOk()).toBe(true);
    const again = await billing.createAdminCustomer({ organizationId: ORG_ID }, adminCtx());
    expect(again.isOk()).toBe(true);
    expect(stripe.customers.create).toHaveBeenCalledTimes(1);

    const [organization] = await orm
      .select()
      .from(authTables.organizations)
      .where(eq(authTables.organizations.id, ORG_ID));
    expect(organization?.stripeCustomerId).toBe("cus_live");
    expect(organization?.stripeSandboxCustomerId).toBe(CUSTOMER_ID);

    const listed = (await billing.listAdminOrganizationBilling({}, adminCtx()))._unsafeUnwrap();
    expect(listed.rows[0]?.stripeCustomerId).toBe(CUSTOMER_ID);
  });

  it("refuses AdminActor Procedures for Owner and Member Actors", async () => {
    const stripe = createStripeStub({});
    const billing = await boot(stripe);

    for (const ctx of [ownerCtx(), memberCtx()]) {
      const created = await billing.createAdminSubscription(
        { organizationId: ORG_ID, priceId: PRICE_ID },
        ctx
      );
      expect(created._unsafeUnwrapErr().code).toBe("FORBIDDEN");
      const listed = await billing.listAdminCoupons(undefined, ctx);
      expect(listed._unsafeUnwrapErr().code).toBe("FORBIDDEN");
    }
    expect(stripe.subscriptions.create).not.toHaveBeenCalled();
  });
});
