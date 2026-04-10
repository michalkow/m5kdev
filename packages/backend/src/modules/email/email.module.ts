import { defineBackendModule } from "../../app";
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
