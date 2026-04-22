import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import type { FunctionComponent } from "react";
import type { Logger } from "pino";
import { createBackendApp } from "../../app";
import { EmailModule } from "./email.module";
import { EmailService, type EmailTemplates } from "./email.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const Template: FunctionComponent<Record<string, unknown>> = ({ previewText }) => previewText as never;

const templates: EmailTemplates = {
  accountDeletion: {
    id: "account-deletion",
    react: Template,
  },
  verification: {
    id: "verification",
    react: Template,
  },
  waitlistConfirmation: {
    id: "waitlist-confirmation",
    react: Template,
  },
  passwordReset: {
    id: "password-reset",
    react: Template,
  },
  systemWaitlistNotification: {
    id: "system-waitlist-notification",
    react: Template,
  },
  waitlistInvite: {
    id: "waitlist-invite",
    react: Template,
  },
  waitlistUserInvite: {
    id: "waitlist-user-invite",
    react: Template,
  },
  organizationInvite: {
    id: "organization-invite",
    react: Template,
  },
};

describe("EmailService", () => {
  it("uses app config links in log mode without requiring Resend", async () => {
    const service = new EmailService({
      templates,
      appConfig: {
        name: "Example App",
        urls: {
          web: "http://localhost:5173",
        },
      },
      emailConfig: {
        mode: "log",
        from: "no-reply@example.com",
      },
    });
    service.logger = {
      level: "info",
      fatal: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      silent: jest.fn(),
    } as unknown as Logger<string, boolean>;

    const result = await service.sendWaitlistInvite("person@example.com", "abc123");

    expect(result.isOk()).toBe(true);
    expect(service.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "waitlist-invite",
        subject: "waitlistInvite",
      }),
      "Email delivery skipped in log mode"
    );
  });

  it("stores rendered email payloads in store mode", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-email-"));

    try {
      const service = new EmailService({
        templates,
        appConfig: {
          name: "Example App",
          urls: {
            web: "http://localhost:5173",
          },
        },
        emailConfig: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
      });

      const result = await service.sendWaitlistUserInvite(
        "person@example.com",
        "invite-code",
        "Owner Name"
      );

      expect(result.isOk()).toBe(true);

      const files = await fs.readdir(outputDirectory);
      expect(files).toHaveLength(1);
      const first = files[0];
      if (!first) {
        throw new Error("Expected rendered email to be stored");
      }

      const payload = JSON.parse(
        await fs.readFile(path.join(outputDirectory, first), "utf8")
      ) as {
        subject: string;
        props: {
          url: string;
        };
      };

      expect(payload.subject).toBe("Owner Name has invited you to join Example App!");
      expect(payload.props.url).toBe(
        "http://localhost:5173/signup?code=invite-code&email=person@example.com"
      );
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });
});

describe("createEmailBackendModule", () => {
  let client: Client;

  beforeEach(() => {
    client = createClient({ url: ":memory:" });
  });

  afterEach(async () => {
    await client.close?.();
  });

  it("builds the email service from backend app config", () => {
    const built = createBackendApp(
      {
        db: { client },
        app: {
          name: "Kernel App",
          urls: {
            web: "http://localhost:5173",
            api: "http://localhost:8080",
          },
        },
        email: {
          mode: "log",
          from: "no-reply@example.com",
          systemNotificationEmail: "ops@example.com",
        },
      },
      [new EmailModule(templates)] as const
    );

    const service = built.modules.email.services.email as EmailService;

    expect(service.brand.name).toBe("Kernel App");
    expect(service.noReplyFrom).toBe("no-reply@example.com");
    expect(service.systemNotificationEmail).toBe("ops@example.com");
    expect(service.mode).toBe("log");
    expect(built.config.app.urls.web).toBe("http://localhost:5173");
  });
});
