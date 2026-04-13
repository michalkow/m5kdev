import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import type Stripe from "stripe";
import { createBackendRouterMap, defineBackendModule } from "../../app";
import * as billingTables from "./billing.db";
import { BillingRepository } from "./billing.repository";
import { createBillingRouter } from "./billing.router";
import { BillingService } from "./billing.service";
import { createBillingTRPC } from "./billing.trpc";

export type CreateBillingBackendModuleOptions<Namespace extends string = string> = {
  id?: string;
  namespace?: Namespace;
  mountPath?: string;
  authModuleId?: string;
  libs: {
    stripe: Stripe;
  };
  config: {
    plans: StripePlan[];
    trial?: StripePlan;
  };
};

export function createBillingBackendModule<const Namespace extends string = "billing">(
  options: CreateBillingBackendModuleOptions<Namespace>
) {
  const id = options.id ?? "billing";
  const namespace = (options.namespace ?? "billing") as Namespace;
  const mountPath = options.mountPath ?? "/billing";
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    db: () => ({
      tables: { ...billingTables },
    }),
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        billing: new BillingRepository({
          orm: db.orm as never,
          schema,
          table: schema.subscriptions,
          libs: options.libs,
          config: options.config,
        }),
      };
    },
    services: ({ repositories }) => ({
      billing: new BillingService({ billing: repositories.billing }, undefined as never),
    }),
    trpc: ({ trpc, services }) =>
      createBackendRouterMap(namespace, createBillingTRPC(trpc, services.billing)),
    express: ({ infra, services, authMiddleware }) => {
      if (!authMiddleware) return;
      infra.express.use(mountPath, createBillingRouter(authMiddleware, services.billing));
    },
  });
}
