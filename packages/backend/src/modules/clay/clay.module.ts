import type { z } from "zod";
import type { WebhookModule } from "../webhook/webhook.module";
import { BaseModule, type ModuleServicesContext, type TableMap } from "../base/base.module";
import { ClayRepository } from "./clay.repository";
import { ClayService } from "./clay.service";

export type ClayTablesConfig<K extends string> = {
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

type ClayModuleDeps = { webhook: WebhookModule };
type ClayModuleTables = TableMap;
type ClayModuleRepositories = {
  clay: ClayRepository;
};
type ClayModuleServices<K extends string> = {
  clay: ClayService<K>;
};
type ClayModuleRouters = never;

export class ClayModule<K extends string> extends BaseModule<
  ClayModuleDeps,
  ClayModuleTables,
  ClayModuleRepositories,
  ClayModuleServices<K>,
  ClayModuleRouters
> {
  readonly id = "clay";
  override readonly dependsOn = ["webhook"] as const;

  constructor(private readonly config: ClayTablesConfig<K>) {
    super();
  }

  override repositories() {
    return {
      clay: new ClayRepository(),
    };
  }

  override services({ repositories, deps }: ModuleServicesContext<ClayModuleDeps, ClayModuleRepositories>) {
    return {
      clay: new ClayService(
        { clay: repositories.clay },
        { webhook: deps.webhook.services.webhook },
        this.config.tables
      ),
    };
  }
}
