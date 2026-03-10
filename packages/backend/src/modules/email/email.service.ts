import { ok } from "neverthrow";
import { createElement, type FunctionComponent } from "react";
import { Resend } from "resend";
import { BaseService } from "#modules/base/base.service";

type Brand = {
  name: string;
  logo: string;
  tagline: string;
};

type OverrideOptions = {
  from?: string;
  subject?: string;
  previewText?: string;
};

type EmailTemplate = {
  id: string;
  subject?: string;
  previewText?: string;
  from?: string;
  react: FunctionComponent<Record<string, unknown>>;
};

type EmailTemplates = {
  accountDeletion: EmailTemplate;
  verification: EmailTemplate;
  waitlistConfirmation: EmailTemplate;
  passwordReset: EmailTemplate;
  systemWaitlistNotification: EmailTemplate;
  waitlistInvite: EmailTemplate;
  waitlistUserInvite: EmailTemplate;
  organizationInvite: EmailTemplate;
  [key: string]: EmailTemplate;
};

type EmailServiceProps = {
  resendApiKey?: string;
  brand: Brand;
  noReplyFrom: string;
  systemNotificationEmail: string;
  templates: EmailTemplates;
};

export class EmailService extends BaseService<never, never> {
  public client: Resend;
  public brand: Brand;
  public noReplyFrom: string;
  public templates: EmailTemplates;
  public systemNotificationEmail: string;

  constructor(props: EmailServiceProps) {
    super(undefined, undefined);
    this.client = new Resend(props.resendApiKey || process.env.RESEND_API_KEY);
    this.client = {} as unknown as Resend;
    this.brand = props.brand;
    this.noReplyFrom = props.noReplyFrom;
    this.templates = props.templates;
    this.systemNotificationEmail = props.systemNotificationEmail;
  }

  async sendTemplate(
    to: string | string[],
    templateKey: keyof EmailTemplates,
    templateProps: Record<string, unknown>,
    options?: OverrideOptions
  ) {
    const template = this.templates[templateKey];
    if (!template) {
      return this.error("NOT_FOUND", `Email template not found: ${String(templateKey)}`);
    }
    const from = options?.from || this.noReplyFrom;
    const subject = options?.subject || template.subject || String(templateKey);
    const previewText = options?.previewText || template.previewText || subject;

    const { error } = await this.client.emails.send({
      to,
      subject,
      from,
      react: createElement(template.react, { ...templateProps, previewText }),
    });
    if (error)
      return this.error("INTERNAL_SERVER_ERROR", `Failed to send email: ${templateKey}`, {
        cause: error,
      });
    return ok();
  }

  async sendBrandTemplate(
    to: string | string[],
    templateKey: keyof EmailTemplates,
    templateProps: Record<string, unknown>,
    options?: OverrideOptions
  ) {
    return this.sendTemplate(
      to,
      templateKey,
      {
        brand: this.brand,
        ...templateProps,
      },
      options
    );
  }

  async sendWaitlistConfirmation(email: string, overrideOptions?: OverrideOptions) {
    return this.sendTemplate(
      email,
      "waitlistConfirmation",
      {
        email,
        brand: this.brand,
      },
      overrideOptions
    );
  }

  async sendWaitlistInvite(email: string, code: string, overrideOptions?: OverrideOptions) {
    const url = `${process.env.VITE_APP_URL}/signup?code=${code}&email=${email}`;
    return this.sendTemplate(
      email,
      "waitlistInvite",
      {
        url,
        brand: this.brand,
      },
      overrideOptions
    );
  }

  async sendWaitlistUserInvite(
    email: string,
    code: string,
    inviter: string,
    name?: string,
    overrideOptions?: OverrideOptions
  ) {
    const url = `${process.env.VITE_APP_URL}/signup?code=${code}&email=${email}`;
    return this.sendTemplate(
      email,
      "waitlistUserInvite",
      {
        url,
        brand: this.brand,
        inviter,
        name,
      },
      {
        previewText: `Create your ${this.brand.name} account today!`,
        subject: `${inviter} has invited you to join ${this.brand.name}!`,
        ...overrideOptions,
      }
    );
  }

  async sendOrganizationInvite(
    email: string,
    organizationName: string,
    inviterName: string,
    role: string,
    url: string,
    overrideOptions?: OverrideOptions
  ) {
    return this.sendTemplate(
      email,
      "organizationInvite",
      {
        url,
        brand: this.brand,
        organizationName,
        inviterName,
        role,
      },
      {
        previewText: `${inviterName} invited you to ${organizationName}`,
        subject: `${inviterName} invited you to join ${organizationName}`,
        ...overrideOptions,
      }
    );
  }

  async sendVerification(email: string, url: string, overrideOptions?: OverrideOptions) {
    return this.sendTemplate(
      email,
      "verification",
      {
        url,
        brand: this.brand,
      },
      overrideOptions
    );
  }

  async sendResetPassword(email: string, url: string, overrideOptions?: OverrideOptions) {
    return this.sendTemplate(
      email,
      "passwordReset",
      {
        url,
        brand: this.brand,
      },
      overrideOptions
    );
  }

  async sendDeleteAccountVerification(
    email: string,
    url: string,
    overrideOptions?: OverrideOptions
  ) {
    return this.sendTemplate(
      email,
      "accountDeletion",
      {
        url,
        brand: this.brand,
      },
      overrideOptions
    );
  }
}
