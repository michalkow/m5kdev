import { defineBackendModule } from "../../app";
import { createRecurrenceTables } from "./recurrence.db";
import { RecurrenceRepository, RecurrenceRulesRepository } from "./recurrence.repository";
import { RecurrenceService } from "./recurrence.service";
import { createRecurrenceTRPC } from "./recurrence.trpc";

export type CreateRecurrenceBackendModuleOptions = {
  id?: string;
  namespace?: string;
  authModuleId?: string;
};

export function createRecurrenceBackendModule(
  options: CreateRecurrenceBackendModuleOptions = {}
) {
  const id = options.id ?? "recurrence";
  const namespace = options.namespace ?? "recurrence";
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    db: ({ deps }) => {
      const authTables = deps[authModuleId].tables as any;
      return {
      tables: createRecurrenceTables({
        users: authTables.users,
        organizations: authTables.organizations,
        teams: authTables.teams,
      }),
      };
    },
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        recurrence: new RecurrenceRepository({
          orm: db.orm as never,
          schema,
          table: schema.recurrence,
        }),
        recurrenceRules: new RecurrenceRulesRepository({
          orm: db.orm as never,
          schema,
          table: schema.recurrenceRules,
        }),
      };
    },
    services: ({ repositories }) => ({
      recurrence: new RecurrenceService(
        {
          recurrence: repositories.recurrence,
          recurrenceRules: repositories.recurrenceRules,
        },
        {}
      ),
    }),
    trpc: ({ trpc, services }) => ({
      [namespace]: createRecurrenceTRPC(trpc, services.recurrence),
    }),
  });
}
