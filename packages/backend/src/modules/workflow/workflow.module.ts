import { defineBackendModule } from "../../app";
import { createWorkflowTables } from "./workflow.db";
import { WorkflowRepository } from "./workflow.repository";
import { WorkflowService } from "./workflow.service";
import { createWorkflowTRPC } from "./workflow.trpc";
import type { WorkflowServiceConfig } from "./workflow.types";

export type CreateWorkflowBackendModuleOptions = Omit<WorkflowServiceConfig, "connection"> & {
  id?: string;
  namespace?: string;
  authModuleId?: string;
};

export function createWorkflowBackendModule(options: CreateWorkflowBackendModuleOptions) {
  const id = options.id ?? "workflow";
  const namespace = options.namespace ?? "workflow";
  const authModuleId = options.authModuleId ?? "auth";

  return defineBackendModule({
    id,
    dependsOn: [authModuleId],
    db: ({ deps }) => {
      const authTables = deps[authModuleId].tables as any;
      return {
      tables: createWorkflowTables({
        users: authTables.users,
      }),
      };
    },
    repositories: ({ db }) => ({
      workflow: new WorkflowRepository({
        orm: db.orm as never,
        schema: db.schema as never,
      }),
    }),
    services: ({ repositories, infra }) => {
      if (!infra.redis) {
        throw new Error(`Workflow module "${id}" requires Redis in createBackendApp(...)`);
      }

      return {
        workflow: new WorkflowService(repositories.workflow, {
          ...options,
          connection: infra.redis.duplicate(),
        }),
      };
    },
    trpc: ({ trpc, services }) => ({
      [namespace]: createWorkflowTRPC(trpc, services.workflow),
    }),
  });
}
