import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import type Stripe from "stripe";
import { createBackendRouterMap } from "../../app";
import type { Grant } from "../base/base.grants";
import {
  BaseModule,
  type ModuleExpressContext,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type { EmailModule } from "../email/email.module";
import type * as billingTables from "./billing.db";
import { defaultBillingGrants } from "./billing.grants";
import { BillingRepository } from "./billing.repository";
import { createBillingRouter } from "./billing.router";
import { BillingService } from "./billing.service";
import { createBillingTRPC } from "./billing.trpc";

type BillingModuleDeps = { email: EmailModule };
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

export type BillingModuleConfig = {
  plans: StripePlan[];
  trial?: StripePlan;
  /**
   * Express mount path for checkout/portal/webhook routes.
   * Defaults to `/stripe` to match `@m5kdev/web-ui` billing links.
   */
  mountPath?: string;
};

export class BillingModule extends BaseModule<
  BillingModuleDeps,
  BillingModuleTables,
  BillingRepositories,
  BillingServices,
  BillingRouters
> {
  readonly id = "billing";
  override readonly dependsOn = ["email"] as const;
  private readonly grants: Grant[];
  private readonly mountPath: string;

  constructor(
    private readonly libs: { stripe: Stripe },
    private readonly config: BillingModuleConfig,
    grants?: Grant[]
  ) {
    super();
    this.grants = grants ?? defaultBillingGrants;
    this.mountPath = config.mountPath ?? "/stripe";
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
    deps,
  }: ModuleServicesContext<BillingModuleDeps, BillingRepositories>) {
    return {
      billing: new BillingService(
        { billing: repositories.billing },
        { email: deps.email.services.email },
        this.grants
      ),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<BillingModuleDeps, BillingServices>) {
    return createBackendRouterMap("billing", createBillingTRPC(trpc, services.billing));
  }

  override express({
    infra,
    services,
    authMiddleware,
  }: ModuleExpressContext<BillingModuleDeps, BillingServices>) {
    if (!authMiddleware) return;
    infra.express.use(this.mountPath, createBillingRouter(authMiddleware, services.billing));
  }
}
