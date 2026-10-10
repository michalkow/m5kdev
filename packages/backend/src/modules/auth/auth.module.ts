import { createBackendRouterMap } from "../../app";
import type { Grant } from "../base/base.grants";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
  type ModuleWorkflowContext,
} from "../base/base.module";
import type { BillingModule } from "../billing/billing.module";
import type { EmailModule } from "../email/email.module";
import type { WorkflowModule } from "../workflow/workflow.module";
import { AUTH_PURGE_CRON_NAME, AUTH_PURGE_CRON_PATTERN } from "./auth.constants";
import type * as authTables from "./auth.db";
import { createOrganizationSchemas } from "./auth.dto";
import { defaultAuthGrants } from "./auth.grants";
import {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "./auth.repository";
import { AuthService, type AuthServiceHooks } from "./auth.service";
import { createAuthTRPC } from "./auth.trpc";

export interface AuthModuleConfig {
  readonly grants?: Grant[];
  readonly hooks?: AuthServiceHooks;
  readonly closeAfterDays?: number;
}

type AuthModuleDeps = { email: EmailModule; billing?: BillingModule; workflow?: WorkflowModule };
type AuthModuleTables = typeof authTables;
type AuthModuleRepositories = {
  accountClaim: AuthAccountClaimRepository;
  user: AuthUserRepository;
  invitation: AuthInvitationRepository;
  waitlist: AuthWaitlistRepository;
  organization: AuthOrganizationRepository;
};
type AuthModuleServices = {
  auth: AuthService;
};
type AuthModuleRouters = {
  auth: ReturnType<typeof createAuthTRPC>;
};
export class AuthModule extends BaseModule<
  AuthModuleDeps,
  AuthModuleTables,
  AuthModuleRepositories,
  AuthModuleServices,
  AuthModuleRouters
> {
  readonly id = "auth";
  override readonly dependsOn = ["email"] as const;
  override readonly optionalDependsOn = ["billing", "workflow"] as const;
  private readonly grants: Grant[];
  private readonly hooks?: AuthServiceHooks;
  private readonly closeAfterDays: number;

  constructor(grants?: Grant[] | AuthModuleConfig, hooks?: AuthServiceHooks) {
    super();
    if (grants && !Array.isArray(grants)) {
      this.grants = grants.grants ?? defaultAuthGrants;
      this.hooks = grants.hooks;
      this.closeAfterDays = grants.closeAfterDays ?? 30;
      return;
    }
    this.grants = grants ?? defaultAuthGrants;
    this.hooks = hooks;
    this.closeAfterDays = 30;
  }

  override repositories({ db }: ModuleRepositoriesContext<AuthModuleDeps, AuthModuleTables>) {
    return {
      accountClaim: new AuthAccountClaimRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.accountClaims,
      }),
      user: new AuthUserRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.users,
      }),
      invitation: new AuthInvitationRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.invitations,
      }),
      waitlist: new AuthWaitlistRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.waitlist,
      }),
      organization: new AuthOrganizationRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.organizations,
      }),
    };
  }

  override services({
    repositories,
    deps,
    appConfig,
    i18n,
    infra,
  }: ModuleServicesContext<AuthModuleDeps, AuthModuleRepositories>) {
    return {
      auth: new AuthService(
        repositories,
        {
          email: deps.email.services.email,
          billing: deps.billing?.services.billing,
        },
        this.grants,
        infra.serverEvents,
        appConfig.urls,
        this.hooks,
        appConfig.locales,
        i18n,
        appConfig.roles,
        this.closeAfterDays
      ),
    };
  }

  override workflows({
    workflow,
    services,
  }: ModuleWorkflowContext<AuthModuleDeps, AuthModuleServices>) {
    if (!workflow) return;
    if (this.closeAfterDays < 1) {
      throw new Error("AuthModule closeAfterDays must be at least 1 when Workflow is present");
    }
    const definition = workflow.service
      .cron({
        name: AUTH_PURGE_CRON_NAME,
        pattern: AUTH_PURGE_CRON_PATTERN,
      })
      .handle(async () => {
        const result = await services.auth.purgeExpired();
        if (result.isErr()) throw result.error;
      });
    const handler = definition._handler;
    if (!handler) {
      throw new Error(`${AUTH_PURGE_CRON_NAME} cron is missing a handler`);
    }
    workflow.registry.register(definition, handler);
  }

  override trpc({
    trpc,
    services,
    appConfig,
  }: ModuleTRPCContext<AuthModuleDeps, AuthModuleServices>) {
    const organizationSchemas = createOrganizationSchemas(appConfig.roles);
    return createBackendRouterMap("auth", createAuthTRPC(trpc, services.auth, organizationSchemas));
  }
}
