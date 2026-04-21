import { createBackendRouterMap } from "../../app";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type { BillingModule } from "../billing/billing.module";
import type { EmailModule } from "../email/email.module";
import * as authTables from "./auth.db";
import {
  AuthInvitationRepository,
  AuthOrganizationRepository,
  AuthRepository,
  AuthUserRepository,
  AuthWaitlistRepository,
} from "./auth.repository";
import { AuthService } from "./auth.service";
import { createAuthTRPC } from "./auth.trpc";

type AuthModuleDeps = { email: EmailModule; billing?: BillingModule };
type AuthModuleTables = typeof authTables;
type AuthModuleRepositories = {
  auth: AuthRepository;
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

  override db() {
    return {
      tables: { ...authTables },
    };
  }

  override repositories({ db }: ModuleRepositoriesContext<AuthModuleDeps, AuthModuleTables>) {
    return {
      auth: new AuthRepository({
        orm: db.orm,
        schema: db.schema,
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
      auth: new AuthService(repositories, {
        email: deps.email.services.email,
        billing: deps.billing?.services.billing,
      }),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<AuthModuleDeps, AuthModuleServices>) {
    return createBackendRouterMap("auth", createAuthTRPC(trpc, services.auth));
  }
}
