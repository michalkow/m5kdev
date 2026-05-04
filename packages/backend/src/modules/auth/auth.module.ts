import { createBackendRouterMap } from "../../app";
import type { Grant } from "../base/base.grants";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type { BillingModule } from "../billing/billing.module";
import type { EmailModule } from "../email/email.module";
import type * as authTables from "./auth.db";
import { authGrants } from "./auth.grants";
import {
  AuthAccountClaimRepository,
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "./auth.repository";
import { AuthService } from "./auth.service";
import { createAuthTRPC } from "./auth.trpc";

type AuthModuleDeps = { email: EmailModule; billing?: BillingModule };
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
  override readonly optionalDependsOn = ["billing"] as const;
  private readonly grants: Grant[];

  constructor(grants?: Grant[]) {
    super();
    this.grants = grants ?? authGrants;
  }

  override repositories({ db }: ModuleRepositoriesContext<AuthModuleDeps, AuthModuleTables>) {
    return {
      accountClaim: new AuthAccountClaimRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.accountClaimMagicLinks,
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
  }: ModuleServicesContext<AuthModuleDeps, AuthModuleRepositories>) {
    return {
      auth: new AuthService(
        repositories,
        {
          email: deps.email.services.email,
          billing: deps.billing?.services.billing,
        },
        this.grants
      ),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<AuthModuleDeps, AuthModuleServices>) {
    return createBackendRouterMap("auth", createAuthTRPC(trpc, services.auth));
  }
}
