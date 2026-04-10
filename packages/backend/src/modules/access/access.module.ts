import type { Statements } from "better-auth/plugins/access";
import { defineBackendModule } from "../../app";
import { AccessRepository } from "./access.repository";
import { AccessService } from "./access.service";
import type { AccessControlRoles } from "./access.utils";

export type CreateAccessBackendModuleOptions<T extends Statements> = {
  id?: string;
  authModuleId?: string;
  acr: AccessControlRoles<T>;
};

export function createAccessBackendModule<T extends Statements>(
  options: CreateAccessBackendModuleOptions<T>
) {
  const id = options.id ?? "access";
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    repositories: ({ db }) => ({
      access: new AccessRepository({
        orm: db.orm as never,
        schema: db.schema as never,
      }),
    }),
    services: ({ repositories }) => ({
      access: new AccessService({ access: repositories.access }, options.acr),
    }),
  });
}
