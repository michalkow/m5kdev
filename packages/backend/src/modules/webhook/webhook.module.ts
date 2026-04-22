import { BaseModule, type ModuleExpressContext, type ModuleRepositoriesContext, type ModuleServicesContext } from "../base/base.module";
import type { webhook } from "./webhook.db";
import { WebhookRepository } from "./webhook.repository";
import { createWebhookRouter } from "./webhook.router";
import { WebhookService } from "./webhook.service";

type WebhookModuleDeps = never;
type WebhookModuleTables = { webhook: typeof webhook };
type WebhookModuleRepositories = {
  webhook: WebhookRepository;
};
type WebhookModuleServices = {
  webhook: WebhookService;
};
type WebhookModuleRouters = never;

export class WebhookModule extends BaseModule<
  WebhookModuleDeps,
  WebhookModuleTables,
  WebhookModuleRepositories,
  WebhookModuleServices,
  WebhookModuleRouters
> {
  readonly id = "webhook";

  constructor(private readonly mountPath: string = "/webhook") {
    super();
  }

  override repositories({
    db,
  }: ModuleRepositoriesContext<WebhookModuleDeps, WebhookModuleTables>) {
    return {
      webhook: new WebhookRepository({
        orm: db.orm,
        schema: db.schema,
        table: db.schema.webhook,
      }),
    };
  }

  override services({
    repositories,
  }: ModuleServicesContext<WebhookModuleDeps, WebhookModuleRepositories>) {
    return {
      webhook: new WebhookService({ webhook: repositories.webhook }, undefined as never),
    };
  }

  override express({ infra, services }: ModuleExpressContext<WebhookModuleDeps, WebhookModuleServices>) {
    infra.express.use(this.mountPath, createWebhookRouter(services.webhook));
  }
}
