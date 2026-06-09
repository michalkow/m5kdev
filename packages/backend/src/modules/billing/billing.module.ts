import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import type Stripe from "stripe";
import { createBackendRouterMap } from "../../app";
import type { Grant } from "../base/base.grants";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as billingTables from "./billing.db";
import { defaultBillingGrants } from "./billing.grants";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { createBillingTRPC } from "./billing.trpc";

type BillingModuleDeps = never;
type BillingModuleTables = typeof billingTables;
type BillingRepositories = {
  billing: BillingRepository;
};
type BillingServices = {
  billing: BillingService;
};
type BillingRouters = {
  billing: ReturnType<typeof createBillingTRPC>;
};

export class BillingModule extends BaseModule<
  BillingModuleDeps,
  BillingModuleTables,
  BillingRepositories,
  BillingServices,
  BillingRouters
> {
  readonly id = "billing";
  private readonly grants: Grant[];

  constructor(
    private readonly libs: { stripe: Stripe },
    private readonly config: { plans: StripePlan[]; trial?: StripePlan },
    grants?: Grant[]
  ) {
    super();
    this.grants = grants ?? defaultBillingGrants;
  }

  override repositories({ db }: ModuleRepositoriesContext<BillingModuleDeps, BillingModuleTables>) {
    return {
      billing: new BillingRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.subscriptions,
        libs: this.libs,
        config: this.config,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<BillingModuleDeps, BillingRepositories>) {
    return {
      billing: new BillingService({ billing: repositories.billing }, {}, this.grants),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<BillingModuleDeps, BillingServices>) {
    return createBackendRouterMap("billing", createBillingTRPC(trpc, services.billing));
  }
}
