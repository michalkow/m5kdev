import fs from "node:fs/promises";
import path from "node:path";
import { templates } from "{{PACKAGE_SCOPE}}/email";
import { EmailService } from "@m5kdev/backend/modules/email/email.service";
import { logger } from "@m5kdev/backend/utils/logger";
import { ok } from "neverthrow";

interface LocalEmailServiceProps {
  appName: string;
  appUrl: string;
}

export class LocalEmailService extends EmailService {
  constructor(props: LocalEmailServiceProps) {
    super({
      resendApiKey: "local",
      brand: {
        name: props.appName,
        logo: `${props.appUrl}/mark.svg`,
        tagline: `${props.appName} publishing workspace`,
      },
      noReplyFrom: "no-reply@local.m5kdev.test",
      systemNotificationEmail: "ops@local.m5kdev.test",
      templates: templates as never,
    });
  }

  override async sendTemplate(
    to: Parameters<EmailService["sendTemplate"]>[0],
    templateKey: Parameters<EmailService["sendTemplate"]>[1],
    templateProps: Parameters<EmailService["sendTemplate"]>[2],
    options?: Parameters<EmailService["sendTemplate"]>[3]
  ) {
    const template = this.templates[String(templateKey)];
    if (!template) {
      return this.error("NOT_FOUND", `Email template not found: ${String(templateKey)}`);
    }

    const outputDirectory = path.resolve(process.cwd(), ".emails");
    await fs.mkdir(outputDirectory, { recursive: true });

    const payload = {
      to,
      templateId: template.id,
      subject: options?.subject ?? template.subject ?? String(templateKey),
      previewText: options?.previewText ?? template.previewText ?? String(templateKey),
      props: templateProps,
      createdAt: new Date().toISOString(),
    };

    const filename = `${Date.now()}-${template.id}.json`;
    const outputPath = path.join(outputDirectory, filename);
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");

    logger.info(`Local email written to ${outputPath}`);
    return ok();
  }
}
