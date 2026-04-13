import { createBackendRouterMap, defineBackendModule } from "../../app";
import * as authTables from "./auth.db";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { createAuthTRPC } from "./auth.trpc";

export type CreateAuthBackendModuleOptions<Namespace extends string = string> = {
  id?: string;
  namespace?: Namespace;
  emailModuleId: string;
  billingModuleId?: string;
};

export function createAuthBackendModule<const Namespace extends string = "auth">(
  options: CreateAuthBackendModuleOptions<Namespace>
) {
  const id = options.id ?? "auth";
  const namespace = (options.namespace ?? "auth") as Namespace;
  const emailModuleId = options.emailModuleId ?? "email";
  const billingModuleId = options.billingModuleId;

  return defineBackendModule({
    id,
    dependsOn: [emailModuleId],
    optionalDependsOn: billingModuleId ? [billingModuleId] : [],
    db: () => ({
      tables: { ...authTables },
    }),
    repositories: ({ db }) => ({
      auth: new AuthRepository({
        orm: db.orm as never,
        schema: db.schema as never,
      }),
    }),
    services: ({ repositories, deps }) => {
      const emailService = deps[emailModuleId]?.services.email;
      if (!emailService) {
        throw new Error(
          `Auth module "${id}" requires an email service from module "${emailModuleId}"`
        );
      }

      const billingService = billingModuleId ? deps[billingModuleId]?.services.billing : undefined;

      return {
        auth: new AuthService(
          { auth: repositories.auth },
          billingService
            ? { email: emailService, billing: billingService }
            : { email: emailService }
        ),
      };
    },
    trpc: ({ trpc, services }) =>
      createBackendRouterMap(namespace, createAuthTRPC(trpc, services.auth)),
  });
}
