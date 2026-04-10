import type { z } from "zod";
import { defineBackendModule } from "../../app";
import { ClayRepository } from "./clay.repository";
import { ClayService } from "./clay.service";

export type CreateClayBackendModuleOptions<K extends string> = {
  id?: string;
  webhookModuleId?: string;
  tables: Record<
    K,
    {
      name?: string;
      tableId?: string;
      viewId?: string;
      webhookUrl: string;
      schema?: z.ZodAny;
      timeoutInSeconds?: number;
    }
  >;
};

export function createClayBackendModule<K extends string>(
  options: CreateClayBackendModuleOptions<K>
) {
  const id = options.id ?? "clay";
  const webhookModuleId = options.webhookModuleId ?? "webhook";

  return defineBackendModule({
    id,
    dependsOn: [webhookModuleId],
    repositories: () => ({
      clay: new ClayRepository(),
    }),
    services: ({ repositories, deps }) => ({
      clay: new ClayService(
        { clay: repositories.clay },
        { webhook: deps[webhookModuleId].services.webhook },
        options.tables
      ),
    }),
  });
}
