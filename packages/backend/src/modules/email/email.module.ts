import { BaseModule, type ModuleServicesContext, type TableMap } from "../base/base.module";
import { EmailService, type EmailTemplates } from "./email.service";

type EmailModuleDeps = never;
type EmailModuleTables = TableMap;
type EmailModuleRepositories = {};
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

  override services({ appConfig, emailConfig, infra }: ModuleServicesContext<
    EmailModuleDeps,
    EmailModuleRepositories
  >) {
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
