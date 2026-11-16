import { BaseModule, type ModuleServicesContext, type TableMap } from "../base/base.module";
import type { CommunicationPolicy } from "./email.schema";
import { EmailService, type EmailTemplateSets, type EmailTemplates } from "./email.service";

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

  constructor(
    templates: EmailTemplates,
    readonly options: {
      templateSets?: EmailTemplateSets;
      communicationPolicy?: CommunicationPolicy;
    } = {}
  ) {
    super();
    this.templates = templates;
  }

  override services({
    appConfig,
    emailConfig,
    infra,
    i18n,
  }: ModuleServicesContext<EmailModuleDeps, EmailModuleRepositories>) {
    return {
      email: new EmailService({
        appConfig,
        emailConfig,
        resend: infra.resend,
        templates: this.templates,
        templateSets: this.options.templateSets,
        communicationPolicy: this.options.communicationPolicy,
        i18n,
      }),
    };
  }
}
