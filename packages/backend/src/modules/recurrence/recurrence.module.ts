import { createBackendRouterMap } from "../../app";
import type { AuthModule } from "../auth/auth.module";
import {
  BaseModule,
  type ModuleRepositoriesContext,
  type ModuleServicesContext,
  type ModuleTRPCContext,
} from "../base/base.module";
import type * as recurrenceTables from "./recurrence.db";
import { RecurrenceRepository, RecurrenceRulesRepository } from "./recurrence.repository";
import { RecurrenceService } from "./recurrence.service";
import { createRecurrenceTRPC } from "./recurrence.trpc";

type RecurrenceModuleDeps = { auth: AuthModule };
type RecurrenceModuleTables = typeof recurrenceTables;
type RecurrenceModuleRepositories = {
  recurrence: RecurrenceRepository;
  recurrenceRules: RecurrenceRulesRepository;
};
type RecurrenceModuleServices = {
  recurrence: RecurrenceService;
};
type RecurrenceModuleRouters<Namespace extends string> = {
  [K in Namespace]: ReturnType<typeof createRecurrenceTRPC>;
};

export class RecurrenceModule<const Namespace extends string = "recurrence"> extends BaseModule<
  RecurrenceModuleDeps,
  RecurrenceModuleTables,
  RecurrenceModuleRepositories,
  RecurrenceModuleServices,
  RecurrenceModuleRouters<Namespace>
> {
  readonly id = "recurrence";
  override readonly dependsOn = ["auth"] as const;

  constructor(private readonly options: { namespace?: Namespace } = {}) {
    super();
  }

  override repositories({ db }: ModuleRepositoriesContext<RecurrenceModuleDeps, RecurrenceModuleTables>) {
    return {
      recurrence: new RecurrenceRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.recurrence,
      }),
      recurrenceRules: new RecurrenceRulesRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.recurrenceRules,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<RecurrenceModuleDeps, RecurrenceModuleRepositories>) {
    return {
      recurrence: new RecurrenceService(
        {
          recurrence: repositories.recurrence,
          recurrenceRules: repositories.recurrenceRules,
        },
        {}
      ),
    };
  }

  override trpc({ trpc, services }: ModuleTRPCContext<RecurrenceModuleDeps, RecurrenceModuleServices>) {
    const namespace = (this.options.namespace ?? "recurrence") as Namespace;
    return createBackendRouterMap(namespace, createRecurrenceTRPC(trpc, services.recurrence));
  }
}
