import fs from "node:fs/promises";
import path from "node:path";
import { ok } from "neverthrow";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resend } from "resend";
import type { BackendAppEmailMode, BackendAppEmailOptions, BackendAppMetadata } from "../../app";
import { BaseService } from "../base/base.service";

export type Brand = {
  name: string;
  logo?: string;
  tagline?: string;
};

export type OverrideOptions = {
  from?: string;
  subject?: string;
  previewText?: string;
};

export type EmailTemplate = {
  id: string;
  subject?: string;
  previewText?: string;
  from?: string;
  react: FunctionComponent<Record<string, unknown>>;
};

export type EmailTemplates = {
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
  templates: EmailTemplates;
  appConfig?: BackendAppMetadata;
  emailConfig?: BackendAppEmailOptions;
  resend?: Resend;
  brand?: Partial<Brand>;
  from?: string;
  systemNotificationEmail?: string;
  outputDirectory?: string;
  mode?: BackendAppEmailMode;
  resendApiKey?: string;
  noReplyFrom?: string;
};

type EmailDeliveryPayload = {
  to: string | string[];
  templateId: string;
  subject: string;
  previewText: string;
  from?: string;
  props: Record<string, unknown>;
  createdAt: string;
  html?: string;
};

function normalizeBaseUrl(url?: string) {
  if (!url) return undefined;
  return url.endsWith("/") ? url : `${url}/`;
}

function buildAppUrl(baseUrl: string | undefined, pathname: string) {
  if (!baseUrl) return null;
  return new URL(pathname, normalizeBaseUrl(baseUrl)).toString();
}

export class EmailService extends BaseService<never, never> {
  public client?: Resend;
  public brand: Brand;
  public noReplyFrom?: string;
  public templates: EmailTemplates;
  public systemNotificationEmail?: string;
  public mode: BackendAppEmailMode;
  public outputDirectory: string;
  public appConfig: BackendAppMetadata;

  constructor(props: EmailServiceProps) {
    super(undefined, undefined);

    const appConfig = props.appConfig ?? {};
    const webUrl = appConfig.urls?.web;
    const name = props.brand?.name ?? appConfig.name ?? "m5kdev";

    this.client = props.resend ?? (props.resendApiKey ? new Resend(props.resendApiKey) : undefined);
    this.brand = {
      name,
      logo:
        props.brand?.logo ??
        appConfig.brand?.logo ??
        (webUrl ? buildAppUrl(webUrl, "/mark.svg") ?? undefined : undefined),
      tagline:
        props.brand?.tagline ??
        appConfig.brand?.tagline ??
        (name ? `${name} publishing workspace` : undefined),
    };
    this.noReplyFrom = props.from ?? props.emailConfig?.from ?? props.noReplyFrom;
    this.templates = props.templates;
    this.systemNotificationEmail =
      props.systemNotificationEmail ?? props.emailConfig?.systemNotificationEmail;
    this.mode = props.mode ?? props.emailConfig?.mode ?? "send";
    this.outputDirectory = props.outputDirectory ?? props.emailConfig?.outputDirectory ?? ".emails";
    this.appConfig = appConfig;
  }

  private resolveTemplate(templateKey: keyof EmailTemplates) {
    return this.templates[templateKey];
  }

  private renderTemplatePayload(
    template: EmailTemplate,
    to: string | string[],
    subject: string,
    previewText: string,
    from: string | undefined,
    templateProps: Record<string, unknown>
  ): EmailDeliveryPayload {
    const reactProps = { ...templateProps, previewText };
    let html: string | undefined;

    try {
      html = renderToStaticMarkup(createElement(template.react, reactProps));
    } catch {
      html = undefined;
    }

    return {
      to,
      templateId: template.id,
      subject,
      previewText,
      from,
      props: reactProps,
      createdAt: new Date().toISOString(),
      html,
    };
  }

  private async deliverPayload(payload: EmailDeliveryPayload, react: ReturnType<typeof createElement>) {
    if (this.mode === "send") {
      if (!this.client) {
        return this.error(
          "INTERNAL_SERVER_ERROR",
          "Email transport is configured for send mode but no Resend client was provided"
        );
      }

      const from = payload.from ?? this.noReplyFrom;
      if (!from) {
        return this.error(
          "INTERNAL_SERVER_ERROR",
          "Email transport is configured for send mode but no sender address was provided"
        );
      }

      const { error } = await this.client.emails.send({
        to: payload.to,
        subject: payload.subject,
        from,
        react,
      });

      if (error) {
        return this.error("INTERNAL_SERVER_ERROR", "Failed to send email", { cause: error });
      }

      return ok();
    }

    if (this.mode === "store") {
      const outputDirectory = path.resolve(process.cwd(), this.outputDirectory);
      await fs.mkdir(outputDirectory, { recursive: true });

      const filename = `${Date.now()}-${payload.templateId}.json`;
      const outputPath = path.join(outputDirectory, filename);
      await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

      this.logger.info({ outputPath, templateId: payload.templateId }, "Email payload stored");
      return ok();
    }

    this.logger.info(
      {
        to: payload.to,
        templateId: payload.templateId,
        subject: payload.subject,
        previewText: payload.previewText,
        props: payload.props,
      },
      "Email delivery skipped in log mode"
    );
    return ok();
  }

  async sendTemplate(
    to: string | string[],
    templateKey: keyof EmailTemplates,
    templateProps: Record<string, unknown>,
    options?: OverrideOptions
  ) {
    const template = this.resolveTemplate(templateKey);
    if (!template) {
      return this.error("NOT_FOUND", `Email template not found: ${String(templateKey)}`);
    }

    const from = options?.from ?? template.from ?? this.noReplyFrom;
    const subject = options?.subject ?? template.subject ?? String(templateKey);
    const previewText = options?.previewText ?? template.previewText ?? subject;
    const react = createElement(template.react, { ...templateProps, previewText });
    const payload = this.renderTemplatePayload(
      template,
      to,
      subject,
      previewText,
      from,
      templateProps
    );

    return this.deliverPayload(payload, react);
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
    const url = buildAppUrl(this.appConfig.urls?.web, `/signup?code=${code}&email=${email}`);
    if (!url) {
      return this.error("INTERNAL_SERVER_ERROR", "App web URL is not configured for email links");
    }

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
    const url = buildAppUrl(this.appConfig.urls?.web, `/signup?code=${code}&email=${email}`);
    if (!url) {
      return this.error("INTERNAL_SERVER_ERROR", "App web URL is not configured for email links");
    }

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
