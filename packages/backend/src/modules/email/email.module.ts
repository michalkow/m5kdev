import { defineBackendModule } from "../../app";
import { BaseModule, type ModuleServicesContext } from "../base/base.module";
import { EmailService, type EmailTemplates } from "./email.service";

export type CreateEmailBackendModuleOptions = {
  id?: string;
  templates: EmailTemplates;
};

export function createEmailBackendModule(options: CreateEmailBackendModuleOptions) {
  return defineBackendModule({
    id: options.id ?? "email",
    services: ({ appConfig, emailConfig, infra }) => ({
      email: new EmailService({
        appConfig,
        emailConfig,
        resend: infra.resend,
        templates: options.templates,
      }),
    }),
  });
}

type EmailModuleDeps = never;
type EmailModuleTables = never;
type EmailModuleRepositories = never;
type EmailModuleServices = {
  email: EmailService;
};
type EmailModuleRouters = never;

export class EmailModule extends BaseModule<
  EmailModuleDeps,
  EmailModuleTables,
  EmailModuleRepositories,
  EmailModuleServices,
  EmailModuleRouters
> {
  readonly id = "email";
  readonly templates: EmailTemplates;

  constructor(templates: EmailTemplates) {
    super();
    this.templates = templates;
  }

  override services({
    appConfig,
    emailConfig,
    infra,
  }: ModuleServicesContext<EmailModuleDeps, EmailModuleRepositories>) {
    return {
      email: new EmailService({
        appConfig,
        emailConfig,
        resend: infra.resend,
        templates: this.templates,
      }),
    };
  }
}
