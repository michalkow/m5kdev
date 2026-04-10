import { defineBackendModule } from "../../app";
import * as webhookTables from "./webhook.db";
import { WebhookRepository } from "./webhook.repository";
import { createWebhookRouter } from "./webhook.router";
import { WebhookService } from "./webhook.service";

export type CreateWebhookBackendModuleOptions = {
  id?: string;
  mountPath?: string;
};

export function createWebhookBackendModule(options: CreateWebhookBackendModuleOptions = {}) {
  const id = options.id ?? "webhook";
  const mountPath = options.mountPath ?? "/webhook";

  return defineBackendModule({
    id,
    db: () => ({
      tables: { ...webhookTables },
    }),
    repositories: ({ db }) => {
      const schema = db.schema as any;
      return {
        webhook: new WebhookRepository({
          orm: db.orm as never,
          schema,
          table: schema.webhook,
        }),
      };
    },
    services: ({ repositories }) => ({
      webhook: new WebhookService({ webhook: repositories.webhook }, undefined as never),
    }),
    express: ({ infra, services }) => {
      infra.express.use(mountPath, createWebhookRouter(services.webhook));
    },
  });
}
