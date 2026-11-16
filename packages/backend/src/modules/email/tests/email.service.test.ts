import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Pool } from "pg";
import type { Logger } from "pino";
import { createElement, type FunctionComponent } from "react";
import { Resend } from "resend";
import { createBackendApp } from "../../../app";
import { createAppI18n } from "../../../i18n/app-i18n";
import { experienceConfig } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { EmailModule } from "../email.module";
import { EmailService, type EmailTemplates, type EmailTranslateFn } from "../email.service";

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

const Template: FunctionComponent<Record<string, unknown>> = ({ previewText }) =>
  previewText as never;

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

const authTemplates: EmailTemplates = {
  accountDeletion: {
    id: "account-deletion",
    react: Template,
  },
  verification: {
    id: "verification",
    react: Template,
  },
  passwordReset: {
    id: "password-reset",
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

      const payload = JSON.parse(await fs.readFile(path.join(outputDirectory, first), "utf8")) as {
        subject: string;
        props: {
          url: string;
        };
      };

      expect(payload.subject).toBe("waitlistUserInvite");
      expect(payload.props.url).toBe(
        "http://localhost:5173/signup?code=invite-code&email=person@example.com"
      );
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("translates subject and previewText keys and injects props.t", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-email-"));

    try {
      const localeConfig = {
        defaultLocale: "en",
        locales: [
          { code: "en", displayName: "English" },
          { code: "en_GB", displayName: "English (UK)" },
        ],
      };
      const appI18n = createAppI18n(localeConfig, {
        en: {
          translation: {
            verification: {
              subject: "Verify your email",
              previewText: "Verify your email address",
            },
          },
        },
      });

      const localizedTemplates: EmailTemplates = {
        ...templates,
        verification: {
          id: "verification",
          subject: "verification.subject",
          previewText: "verification.previewText",
          react: Template,
        },
      };

      const service = new EmailService({
        templates: localizedTemplates,
        appConfig: {
          locales: localeConfig,
        },
        emailConfig: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
        i18n: appI18n,
      });

      const result = await service.sendVerification(
        "person@example.com",
        "https://example.com/verify",
        {
          locale: "en_GB",
        }
      );

      expect(result.isOk()).toBe(true);

      const files = await fs.readdir(outputDirectory);
      const first = files[0];
      if (!first) {
        throw new Error("Expected rendered email to be stored");
      }

      const payload = JSON.parse(await fs.readFile(path.join(outputDirectory, first), "utf8")) as {
        subject: string;
        previewText: string;
        props: {
          htmlLang: string;
        };
      };

      expect(payload.subject).toBe("Verify your email");
      expect(payload.previewText).toBe("Verify your email address");
      expect(payload.props.htmlLang).toBe("en-GB");
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("falls back to app default locale when override locale is omitted", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-email-"));

    try {
      const localeConfig = {
        defaultLocale: "en_GB",
        locales: [
          { code: "en", displayName: "English" },
          { code: "en_GB", displayName: "English (UK)" },
        ],
      };
      const appI18n = createAppI18n(localeConfig, {
        en_GB: {
          translation: {
            verification: {
              subject: "Verify your email (UK)",
            },
          },
        },
      });

      const localizedTemplates: EmailTemplates = {
        ...templates,
        verification: {
          id: "verification",
          subject: "verification.subject",
          react: Template,
        },
      };

      const service = new EmailService({
        templates: localizedTemplates,
        appConfig: {
          locales: localeConfig,
        },
        emailConfig: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
        i18n: appI18n,
      });

      const result = await service.sendVerification(
        "person@example.com",
        "https://example.com/verify"
      );

      expect(result.isOk()).toBe(true);

      const files = await fs.readdir(outputDirectory);
      const first = files[0];
      if (!first) {
        throw new Error("Expected rendered email to be stored");
      }

      const payload = JSON.parse(await fs.readFile(path.join(outputDirectory, first), "utf8")) as {
        subject: string;
        props: {
          htmlLang: string;
        };
      };

      expect(payload.subject).toBe("Verify your email (UK)");
      expect(payload.props.htmlLang).toBe("en-GB");
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("uses subject key as literal when i18n is not configured", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-email-"));

    try {
      const localizedTemplates: EmailTemplates = {
        ...templates,
        verification: {
          id: "verification",
          subject: "verification.subject",
          react: Template,
        },
      };

      const service = new EmailService({
        templates: localizedTemplates,
        emailConfig: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
      });

      const result = await service.sendVerification(
        "person@example.com",
        "https://example.com/verify"
      );

      expect(result.isOk()).toBe(true);

      const files = await fs.readdir(outputDirectory);
      const first = files[0];
      if (!first) {
        throw new Error("Expected rendered email to be stored");
      }

      const payload = JSON.parse(await fs.readFile(path.join(outputDirectory, first), "utf8")) as {
        subject: string;
      };

      expect(payload.subject).toBe("verification.subject");
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("accepts extra Email template keys besides the Auth set", () => {
    const withKind: EmailTemplates = {
      ...authTemplates,
      notificationInbox: {
        id: "notification-inbox",
        react: Template,
      },
    };
    expect(withKind.notificationInbox?.id).toBe("notification-inbox");
  });

  it("fails sendWaitlistInvite when the waitlist Email template is missing", async () => {
    const service = new EmailService({
      templates: authTemplates,
      appConfig: {
        urls: {
          web: "http://localhost:5173",
        },
      },
      emailConfig: {
        mode: "log",
        from: "no-reply@example.com",
      },
    });

    const result = await service.sendWaitlistInvite("person@example.com", "abc123");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
      expect(result.error.message).toContain("waitlistInvite");
    }
  });
});

describe("createEmailBackendModule", () => {
  let client: Pool;

  beforeEach(() => {
    client = createTestPool();
  });

  afterEach(async () => {
    await client.end();
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

describe("Experience email delivery", () => {
  let client: Pool;
  let outputDirectory: string;

  beforeEach(async () => {
    client = createTestPool();
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-experience-email-"));
  });

  afterEach(async () => {
    await client.end();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  const BrandedTemplate: FunctionComponent<Record<string, unknown>> = ({
    brand,
    url,
    copy = "report",
  }) => {
    const identity = brand as { name: string; logo: string };
    return createElement(
      "main",
      null,
      createElement("img", { src: identity.logo, alt: identity.name }),
      createElement("a", { href: String(url) }, `${identity.name} ${copy}`)
    );
  };

  function build(mode: "store" | "log" = "store") {
    const built = createBackendApp(
      {
        db: { client },
        app: {
          experiences: {
            ...experienceConfig,
            brands: {
              ...experienceConfig.brands,
              radar: { name: "Gastro Raider", logo: "https://radar.example.test/logo.svg" },
              horeka: { name: "Horeka AI", logo: "https://horeka.example.test/logo.svg" },
              partner: { name: "Partner Radar", logo: "https://partner.example.test/logo.svg" },
            },
            emailProfiles: {
              radar: { from: "Gastro Raider <radar@example.test>" },
              horeka: { from: "Horeka AI <horeka@example.test>", templateSet: "assistant" },
              partner: { from: "Partner Radar <partner@example.test>", templateSet: "partner" },
            },
            definitions: {
              ...experienceConfig.definitions,
              radar: { ...experienceConfig.definitions.radar, emailProfile: "radar" },
              horeka: { ...experienceConfig.definitions.horeka, emailProfile: "horeka" },
              partner: { ...experienceConfig.definitions.partner, emailProfile: "partner" },
            },
          },
        },
        email: { mode, from: "legacy@example.test", outputDirectory },
      },
      [
        new EmailModule(
          {
            ...templates,
            report: { id: "report", react: BrandedTemplate },
          },
          {
            templateSets: {
              assistant: {
                ...templates,
                report: {
                  id: "assistant-report",
                  react: (props) =>
                    createElement(BrandedTemplate, { ...props, copy: "assistant digest" }),
                },
              },
              partner: {
                ...templates,
                report: {
                  id: "partner-report",
                  react: (props) =>
                    createElement(BrandedTemplate, { ...props, copy: "partner briefing" }),
                },
              },
            },
          }
        ),
      ] as const
    );
    return built.modules.email.services.email;
  }

  it("stores and renders one validated Experience's sender, brand and canonical links together", async () => {
    const service = build();
    const options = { experience: "radar", linkPaths: { url: "/reports/7" } };
    const result = await service.sendBrandTemplate(
      "reader@example.test",
      "report",
      {
        brand: { name: "Wrong brand" },
        url: "https://wrong.example.test/report",
      },
      options
    );
    expect(result.isOk()).toBe(true);
    const email = await service.findLatestStoredEmail({ to: "reader@example.test" });
    expect(email).toMatchObject({
      from: "Gastro Raider <radar@example.test>",
      templateId: "report",
      props: {
        brand: { name: "Gastro Raider", logo: "https://radar.example.test/logo.svg" },
        experience: { id: "radar", webOrigin: "https://radar.example.test" },
        url: "https://radar.example.test/reports/7",
      },
    });
    expect(email?.html).toContain('alt="Gastro Raider"');
    expect(email?.html).toContain('src="https://radar.example.test/logo.svg"');
    expect(email?.html).toContain('href="https://radar.example.test/reports/7"');
    expect(email?.html).toContain("Gastro Raider report");
    expect(email?.html).not.toContain("Wrong brand");
  });

  it("keeps interleaved products and another brand of one product isolated", async () => {
    const service = build();
    const refs = ["radar", "horeka", "partner", "radar"];
    const results = await Promise.all(
      refs.map((experience, index) =>
        service.sendTemplate(
          `reader${index}@example.test`,
          "report",
          { experience: { id: "wrong" }, brand: { name: "Wrong" } },
          { experience, linkPaths: { url: "/reports/9" } }
        )
      )
    );
    expect(results.every((result) => result.isOk())).toBe(true);
    const expected = [
      ["Gastro Raider", "radar", "report", "report"],
      ["Horeka AI", "horeka", "assistant-report", "assistant digest"],
      ["Partner Radar", "partner", "partner-report", "partner briefing"],
      ["Gastro Raider", "radar", "report", "report"],
    ];
    for (const [index, [name, id, templateId, copy]] of expected.entries()) {
      const email = await service.findLatestStoredEmail({ to: `reader${index}@example.test` });
      expect(email).toMatchObject({
        from: `${name} <${id}@example.test>`,
        templateId,
        props: { brand: { name }, experience: { id }, url: `https://${id}.example.test/reports/9` },
      });
      expect(email?.html).toContain(`${name} ${copy}`);
      expect(email?.html).toContain(`src="https://${id}.example.test/logo.svg"`);
      expect(email?.html).toContain(`href="https://${id}.example.test/reports/9"`);
      expect(email?.html).not.toContain("Wrong");
    }
    expect(await service.listStoredEmails()).toHaveLength(4);
  });

  it("rejects an unknown template set during app configuration", () => {
    expect(
      () =>
        new EmailService({
          templates,
          appConfig: {
            experiences: {
              ...experienceConfig,
              emailProfiles: { missing: { templateSet: "not-registered" } },
              definitions: {
                ...experienceConfig.definitions,
                radar: { ...experienceConfig.definitions.radar, emailProfile: "missing" },
              },
            },
          },
        })
    ).toThrow("unknown Email template set not-registered");
  });

  it.each(["", "   ", "Sender <sender@example.test>\r\nBcc: other@example.test"])(
    "rejects an invalid email-profile sender %j at boot",
    (from) => {
      expect(
        () =>
          new EmailService({
            templates,
            appConfig: {
              experiences: {
                ...experienceConfig,
                emailProfiles: { invalid: { from } },
              },
            },
          })
      ).toThrow();
    }
  );

  it("preserves single-Experience shorthand brand defaults and per-send brand overrides", async () => {
    const built = createBackendApp(
      {
        db: { client },
        app: {
          name: "Legacy App",
          urls: { web: "https://legacy.example.test", api: "https://legacy.example.test" },
        },
        email: { mode: "store", from: "legacy@example.test", outputDirectory },
      },
      [new EmailModule({ ...templates, report: { id: "report", react: BrandedTemplate } })] as const
    );
    const service = built.modules.email.services.email;
    expect((await service.sendBrandTemplate("default@example.test", "report", {})).isOk()).toBe(
      true
    );
    expect(
      (
        await service.sendBrandTemplate("custom@example.test", "report", {
          brand: { name: "Custom", logo: "https://legacy.example.test/custom.svg" },
        })
      ).isOk()
    ).toBe(true);
    const defaultEmail = await service.findLatestStoredEmail({ to: "default@example.test" });
    expect(defaultEmail?.html).toContain('src="https://legacy.example.test/mark.svg"');
    expect(defaultEmail?.html).toContain("Legacy App report");
    const customEmail = await service.findLatestStoredEmail({ to: "custom@example.test" });
    expect(customEmail?.html).toContain('src="https://legacy.example.test/custom.svg"');
    expect(customEmail?.html).toContain("Custom report");
  });

  it.each([
    { experience: undefined, message: "Experience context is required" },
    { experience: "unknown", message: "Unknown or disabled Experience unknown" },
  ])(
    "rejects missing or unknown explicit context before storing mail: $message",
    async ({ experience, message }) => {
      const service = build();
      const result = await service.sendTemplate(
        "reader@example.test",
        "report",
        {},
        { experience }
      );
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("INTERNAL_SERVER_ERROR");
        expect(result.error.message).toBe(message);
      }
      expect(await service.listStoredEmails()).toEqual([]);
    }
  );

  it.each([
    { linkPaths: { url: "https://horeka.example.test/reports" } },
    { linkPaths: { url: "//evil.example.test/reports" } },
    { linkPaths: { brand: "/reports" } },
  ])(
    "rejects cross-Experience links and reserved identity link props: %j",
    async ({ linkPaths }) => {
      const service = build();
      const result = await service.sendTemplate(
        "reader@example.test",
        "report",
        {},
        { experience: "radar", linkPaths }
      );
      expect(result.isErr()).toBe(true);
      expect(await service.listStoredEmails()).toEqual([]);
    }
  );

  it("resolves a supplied public descriptor from the authoritative registry", async () => {
    const service = build();
    const registry = service.appConfig.experienceRegistry;
    if (!registry) throw new Error("Expected Experience registry");
    const descriptor = registry.get("radar");
    expect(
      (
        await service.sendTemplate(
          "reader@example.test",
          "report",
          {},
          {
            experience: {
              ...descriptor,
              brand: { name: "Injected" },
              webOrigin: registry.get("horeka").webOrigin,
            },
            linkPaths: { url: "/reports" },
          }
        )
      ).isOk()
    ).toBe(true);
    const email = await service.findLatestStoredEmail({ to: "reader@example.test" });
    expect(email?.html).toContain("Gastro Raider report");
    expect(email?.props.experience).toEqual(descriptor);
  });

  it("keeps recipient locale and per-send subject, preview and sender ahead of template/profile defaults", async () => {
    const locales = {
      defaultLocale: "en",
      locales: [
        { code: "en", displayName: "English" },
        { code: "pl", displayName: "Polski" },
      ],
    };
    const i18n = createAppI18n(locales, {
      en: {
        translation: {
          subject: "{{brandName}} report",
          preview: "Read your report",
          body: "Report content",
        },
      },
      pl: {
        translation: {
          subject: "Raport {{brandName}}",
          preview: "Przeczytaj raport",
          body: "Treść raportu",
        },
      },
    });
    const localizedTemplates: EmailTemplates = {
      ...templates,
      report: {
        id: "report",
        from: "Template <template@example.test>",
        subject: "subject",
        previewText: "preview",
        react: ({ t, htmlLang, brand }) =>
          createElement(
            "main",
            { lang: String(htmlLang) },
            (t as EmailTranslateFn)("body"),
            (brand as { name: string }).name
          ),
      },
    };
    const service = new EmailService({
      templates: localizedTemplates,
      templateSets: { assistant: localizedTemplates, partner: localizedTemplates },
      appConfig: { experienceRegistry: build().appConfig.experienceRegistry, locales },
      i18n,
      mode: "store",
      outputDirectory,
      from: "global@example.test",
    });
    expect(
      (
        await service.sendBrandTemplate(
          "localized@example.test",
          "report",
          {},
          {
            experience: "partner",
            locale: "pl",
          }
        )
      ).isOk()
    ).toBe(true);
    const localized = await service.findLatestStoredEmail({ to: "localized@example.test" });
    expect(localized).toMatchObject({
      from: "Template <template@example.test>",
      subject: "Raport Partner Radar",
      previewText: "Przeczytaj raport",
      props: { htmlLang: "pl" },
    });
    expect(localized?.html).toContain('lang="pl"');
    expect(localized?.html).toContain("Treść raportu");
    expect(
      (
        await service.sendBrandTemplate(
          "override@example.test",
          "report",
          {},
          {
            experience: "radar",
            locale: "pl",
            subject: "Custom subject",
            previewText: "Custom preview",
            from: "Override <override@example.test>",
          }
        )
      ).isOk()
    ).toBe(true);
    const overridden = await service.findLatestStoredEmail({ to: "override@example.test" });
    expect(overridden).toMatchObject({
      from: "Override <override@example.test>",
      subject: "Custom subject",
      previewText: "Custom preview",
    });
    expect(overridden?.html).toContain("Treść raportu");
    expect(overridden?.html).toContain("Gastro Raider");
    expect(locales.defaultLocale).toBe("en");
    expect(i18n.defaultLocale).toBe("en");
  });

  it("delivers the same resolved identity through the Resend boundary without storing in send mode", async () => {
    const resend = new Resend("test-key");
    const send = jest.spyOn(resend.emails, "send").mockResolvedValue({
      data: { id: "delivery-1" },
      error: null,
    });
    const service = new EmailService({
      templates: { ...templates, report: { id: "report", react: BrandedTemplate } },
      appConfig: { experienceRegistry: build().appConfig.experienceRegistry },
      templateSets: { assistant: templates, partner: templates },
      resend,
      mode: "send",
      outputDirectory,
    });
    const result = await service.sendTemplate(
      "reader@example.test",
      "report",
      {},
      {
        experience: "radar",
        subject: "Report",
        linkPaths: { url: "/reports/7" },
      }
    );
    expect(result.isOk()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "reader@example.test",
        from: "Gastro Raider <radar@example.test>",
        subject: "Report",
        react: expect.objectContaining({
          props: expect.objectContaining({
            brand: expect.objectContaining({ name: "Gastro Raider" }),
            url: "https://radar.example.test/reports/7",
          }),
        }),
      })
    );
    expect(await service.listStoredEmails()).toEqual([]);
  });

  it("logs the resolved sender and identity without storing in log mode", async () => {
    const service = build("log");
    const info = jest.spyOn(service.logger, "info").mockImplementation(() => undefined);
    try {
      expect(
        (
          await service.sendTemplate(
            "reader@example.test",
            "report",
            {},
            {
              experience: "radar",
              linkPaths: { url: "/reports" },
            }
          )
        ).isOk()
      ).toBe(true);
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Gastro Raider <radar@example.test>",
          props: expect.objectContaining({
            brand: expect.objectContaining({ name: "Gastro Raider" }),
            url: "https://radar.example.test/reports",
          }),
        }),
        "Email delivery skipped in log mode"
      );
      expect(await service.listStoredEmails()).toEqual([]);
    } finally {
      info.mockRestore();
    }
  });
});
