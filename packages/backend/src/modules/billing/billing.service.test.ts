import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import type { FunctionComponent } from "react";
import type Stripe from "stripe";
import { createBackendApp } from "../../app";
import * as authTables from "../auth/auth.db";
import { EmailModule } from "../email/email.module";
import type { EmailTemplates } from "../email/email.service";
import * as billingTables from "./billing.db";
import { BillingModule } from "./billing.module";
import type { BillingService } from "./billing.service";

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

const PRICE_ID = "price_trial";
const CUSTOMER_ID = "cus_trial";
const USER_ID = "user_trial";
const USER_EMAIL = "pat@example.com";
const PORTAL_URL = "https://billing.stripe.com/p/session/test_portal";

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
  priceId: PRICE_ID,
  freeTrial: { days: 7 },
};

function createStripeStub(options: {
  subscriptionDefaultPaymentMethod?: string | null;
  customerDefaultPaymentMethod?: string | null;
}): Stripe {
  const now = Math.floor(Date.now() / 1000);
  const subscription = {
    id: "sub_trial",
    customer: CUSTOMER_ID,
    status: "trialing",
    default_payment_method: options.subscriptionDefaultPaymentMethod ?? null,
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: now,
          current_period_end: now + 60 * 60 * 24 * 30,
          price: {
            id: PRICE_ID,
            unit_amount: 0,
            recurring: { interval: "month" },
          },
        },
      ],
    },
    discounts: [],
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    trial_start: now - 60 * 60 * 24 * 4,
    trial_end: now + 60 * 60 * 24 * 3,
  };

  return {
    subscriptions: {
      list: jest.fn().mockResolvedValue({ data: [subscription] }),
    },
    customers: {
      retrieve: jest.fn().mockResolvedValue({
        id: CUSTOMER_ID,
        invoice_settings: {
          default_payment_method: options.customerDefaultPaymentMethod ?? null,
        },
      }),
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: PORTAL_URL }),
      },
    },
  } as unknown as Stripe;
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
      stripe_customer_id TEXT UNIQUE,
      payment_customer_id TEXT UNIQUE,
      payment_plan_tier TEXT,
      payment_plan_expires_at INTEGER,
      preferences TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      onboarding INTEGER,
      flags TEXT DEFAULT '[]',
      locale TEXT
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
      unit_amount INTEGER,
      discounts TEXT,
      cancel_at_period_end INTEGER,
      cancel_at INTEGER,
      canceled_at INTEGER,
      seats INTEGER,
      trial_start INTEGER,
      trial_end INTEGER
    );
  `);
}

async function insertUser(client: Client): Promise<void> {
  const orm = drizzle(client, { schema: { users: authTables.users } });
  await orm.insert(authTables.users).values({
    id: USER_ID,
    name: "Pat",
    email: USER_EMAIL,
    emailVerified: true,
    stripeCustomerId: CUSTOMER_ID,
  });
}

async function bootBilling(options: {
  client: Client;
  templates: EmailTemplates;
  outputDirectory: string;
  stripe: Stripe;
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
      new BillingModule({ stripe: options.stripe }, { plans: [plan], trial: plan }),
    ] as const
  );

  return built.modules.billing.services.billing;
}

describe("BillingService.processEvent trial_will_end", () => {
  let client: Client;
  let outputDirectory: string;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-billing-email-"));
    await createTables(client);
    await insertUser(client);
  });

  afterEach(async () => {
    await client.close?.();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  it("emails the User a portal URL when Stripe would cancel, and still syncs", async () => {
    const stripe = createStripeStub({});
    const billing = await bootBilling({
      client,
      templates: trialEndingTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.processEvent(trialWillEndEvent("evt_trial_1"));

    expect(result.isOk()).toBe(true);

    const files = await fs.readdir(outputDirectory);
    expect(files).toHaveLength(1);
    const first = files[0];
    if (!first) {
      throw new Error("Expected trial-ending email to be stored");
    }

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
      .where(eq(billingTables.subscriptions.referenceId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("trialing");
  });

  it("does not email when a usable default payment method exists, and still syncs", async () => {
    const stripe = createStripeStub({ subscriptionDefaultPaymentMethod: "pm_card" });
    const billing = await bootBilling({
      client,
      templates: trialEndingTemplates,
      outputDirectory,
      stripe,
    });

    const result = await billing.processEvent(
      trialWillEndEvent("evt_trial_pm", { defaultPaymentMethod: "pm_card" })
    );

    expect(result.isOk()).toBe(true);
    expect(await fs.readdir(outputDirectory)).toHaveLength(0);

    const orm = drizzle(client, { schema: billingTables });
    const rows = await orm
      .select()
      .from(billingTables.subscriptions)
      .where(eq(billingTables.subscriptions.referenceId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("trialing");
  });

  it("succeeds and skips send when the trial-ending template is unregistered", async () => {
    const stripe = createStripeStub({});
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
    const billing = await bootBilling({
      client,
      templates: trialEndingTemplates,
      outputDirectory,
      stripe,
    });

    const first = await billing.processEvent(trialWillEndEvent("evt_trial_same"));
    const retry = await billing.processEvent(trialWillEndEvent("evt_trial_same"));
    const later = await billing.processEvent(trialWillEndEvent("evt_trial_extended"));

    expect(first.isOk()).toBe(true);
    expect(retry.isOk()).toBe(true);
    expect(later.isOk()).toBe(true);
    expect(await fs.readdir(outputDirectory)).toHaveLength(2);
  });
});
