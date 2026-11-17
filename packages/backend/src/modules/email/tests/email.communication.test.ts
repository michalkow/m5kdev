import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { experienceIdSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { createElement } from "react";
import { type BackendAppMetadata, createBackendApp } from "../../../app";
import { experienceConfig } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { EmailModule } from "../email.module";
import type { CommunicationPolicy } from "../email.schema";
import { EmailService, type EmailTemplates } from "../email.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({
  toNodeHandler: () => () => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

const report = {
  id: "report",
  react: ({ brand, url, htmlLang }: Record<string, unknown>) =>
    createElement(
      "main",
      { lang: String(htmlLang) },
      createElement("h1", null, (brand as { name: string }).name),
      createElement("a", { href: String(url) }, "Read report")
    ),
};
const templates: EmailTemplates = {
  accountDeletion: report,
  verification: report,
  passwordReset: report,
  organizationInvite: report,
  report,
};

describe("App-registered communication presentation", () => {
  const client = createTestPool();
  let outputDirectory: string;
  beforeEach(async () => {
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-communication-"));
  });
  afterEach(async () => {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });
  afterAll(async () => {
    await client.end();
  });

  function build(
    policy?: CommunicationPolicy,
    metadata: BackendAppMetadata = { experiences: experienceConfig }
  ) {
    return createBackendApp(
      {
        db: { client },
        app: metadata,
        email: { mode: "store", outputDirectory, from: "global@example.test" },
      },
      [new EmailModule(templates, { communicationPolicy: policy })] as const
    ).modules.email.services.email;
  }

  it("resolves trusted event ids once before sending the selected sender, template, links and locale", async () => {
    const context = {
      event: "app.report-ready",
      eventId: "event-7",
      organizationId: "org-1",
      resourceId: "report-7",
    };
    const policy = jest.fn(async () => experienceIdSchema.parse("horeka"));
    const app = createBackendApp(
      {
        db: { client },
        app: {
          locales: {
            defaultLocale: "en",
            locales: [
              { code: "en", displayName: "English" },
              { code: "en_GB", displayName: "English (UK)" },
            ],
          },
          experiences: {
            ...experienceConfig,
            emailProfiles: {
              horeka: { from: "Horeka <horeka@example.test>", templateSet: "assistant" },
            },
            definitions: {
              ...experienceConfig.definitions,
              horeka: { ...experienceConfig.definitions.horeka, emailProfile: "horeka" },
            },
          },
        },
        email: { mode: "store", outputDirectory },
      },
      [
        new EmailModule(templates, {
          templateSets: {
            assistant: { ...templates, report: { ...report, id: "assistant-report" } },
          },
          communicationPolicy: policy,
        }),
      ] as const
    );
    const email = app.modules.email.services.email;
    const selected = await email.resolveCommunicationExperience({ context });
    if (selected.isErr()) throw selected.error;
    expect(selected.value.id).toBe("horeka");
    const sent = await email.sendBrandTemplate(
      "reader@example.test",
      "report",
      {},
      {
        experience: selected.value,
        linkPaths: { url: "/reports/7" },
        locale: "en_GB",
      }
    );
    expect(sent.isOk()).toBe(true);
    expect(policy).toHaveBeenCalledTimes(1);
    expect(policy).toHaveBeenCalledWith(context);
    const stored = await email.findLatestStoredEmail({ to: "reader@example.test" });
    expect(stored).toMatchObject({
      from: "Horeka <horeka@example.test>",
      templateId: "assistant-report",
      props: {
        experience: { id: "horeka" },
        url: "https://horeka.example.test/reports/7",
        htmlLang: "en-GB",
      },
    });
    expect(stored?.html).toContain("Horeka AI");
    expect(stored?.html).toContain('href="https://horeka.example.test/reports/7"');
    expect(stored?.html).toContain('lang="en-GB"');
  });
  it("keeps an explicit reference over policy and never falls back from an invalid reference", async () => {
    const policy = jest.fn(async () => experienceIdSchema.parse("radar"));
    const email = build(policy);
    const context = { event: "admin.report", organizationId: "org-1" };
    const selected = await email.resolveCommunicationExperience({
      experienceId: experienceIdSchema.parse("horeka"),
      context,
    });
    if (selected.isErr()) throw selected.error;
    expect(
      (
        await email.sendTemplate(
          "bound@example.test",
          "report",
          {},
          { experience: selected.value, linkPaths: { url: "/reports/8" } }
        )
      ).isOk()
    ).toBe(true);
    const stored = await email.findLatestStoredEmail({ to: "bound@example.test" });
    expect(stored?.props.url).toBe("https://horeka.example.test/reports/8");
    expect(stored?.html).toContain("Horeka AI");
    for (const id of ["missing", "", "bad id"]) {
      const result = await email.resolveCommunicationExperience(
        JSON.parse(JSON.stringify({ experienceId: id, context }))
      );
      expect(result.isErr()).toBe(true);
    }
    expect(policy).not.toHaveBeenCalled();
    expect(await email.listStoredEmails()).toHaveLength(1);
  });

  it("keeps older shorthand jobs unambiguous without defaulting an explicit single-profile registry", async () => {
    const email = build(undefined, {
      name: "Legacy App",
      urls: { web: "https://legacy.example.test", api: "https://legacy.example.test" },
    });
    const selected = await email.resolveCommunicationExperience();
    if (selected.isErr()) throw selected.error;
    expect(
      (
        await email.sendTemplate(
          "older@example.test",
          "report",
          {},
          { experience: selected.value, linkPaths: { url: "/reports/old" } }
        )
      ).isOk()
    ).toBe(true);
    expect((await email.findLatestStoredEmail({ to: "older@example.test" }))?.props.url).toBe(
      "https://legacy.example.test/reports/old"
    );
    const strict = build(undefined, {
      experiences: {
        ...experienceConfig,
        definitions: { radar: experienceConfig.definitions.radar },
      },
    });
    expect((await strict.resolveCommunicationExperience()).isErr()).toBe(true);
    expect(
      (
        await strict.resolveCommunicationExperience({ context: { event: "scheduled.report" } })
      ).isErr()
    ).toBe(true);
    const manual = new EmailService({ templates, mode: "store", outputDirectory });
    expect((await manual.resolveCommunicationExperience()).isErr()).toBe(true);
    expect(
      (
        await manual.sendTemplate("manual@example.test", "report", { brand: { name: "Manual" } })
      ).isOk()
    ).toBe(true);
  });

  it.each([undefined, null, ["radar", "horeka"], { id: "radar" }, "unknown", "bad id"])(
    "rejects invalid policy output %j without falling back to the shorthand default",
    async (value) => {
      const policy = jest.fn(async () =>
        value === undefined ? undefined : JSON.parse(JSON.stringify(value))
      );
      const email = build(policy, {
        name: "Legacy App",
        urls: { web: "https://legacy.example.test", api: "https://legacy.example.test" },
      });
      const result = await email.resolveCommunicationExperience({
        context: { event: "scheduled.report", resourceId: "report-1" },
      });
      expect(result.isErr()).toBe(true);
      expect(policy).toHaveBeenCalledTimes(1);
      expect(await email.listStoredEmails()).toEqual([]);
    }
  );

  it("reports rejected, missing and disabled policy context without implicitly selecting for ordinary sends", async () => {
    const policy = jest.fn(async () => experienceIdSchema.parse("radar"));
    const email = build(policy);
    expect((await email.resolveCommunicationExperience()).isErr()).toBe(true);
    expect(
      (
        await email.resolveCommunicationExperience(
          JSON.parse('{"context":{"event":"admin.report","recipientEmail":"someone@example.test"}}')
        )
      ).isErr()
    ).toBe(true);
    expect((await email.sendTemplate("neutral@example.test", "report", {})).isErr()).toBe(true);
    expect(policy).not.toHaveBeenCalled();
    expect(await email.listStoredEmails()).toEqual([]);
    const disabled = build(policy, {
      experiences: {
        ...experienceConfig,
        definitions: {
          ...experienceConfig.definitions,
          horeka: { ...experienceConfig.definitions.horeka, disabled: true },
        },
      },
    });
    expect(
      (
        await disabled.resolveCommunicationExperience({
          experienceId: experienceIdSchema.parse("horeka"),
        })
      ).isErr()
    ).toBe(true);
    expect(policy).not.toHaveBeenCalled();
    const rejected = build(async () => {
      throw new Error("Policy lookup unavailable");
    });
    const result = await rejected.resolveCommunicationExperience({
      context: { event: "webhook.report", eventId: "event-1" },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("Policy lookup unavailable");
    expect(await rejected.listStoredEmails()).toEqual([]);
  });

  it("rejects a malformed serialized resolver input instead of treating null as the shorthand default", async () => {
    const email = build(undefined, {
      name: "Legacy",
      urls: { web: "https://legacy.example.test", api: "https://legacy.example.test" },
    });
    expect((await email.resolveCommunicationExperience(JSON.parse("null"))).isErr()).toBe(true);
    expect(await email.listStoredEmails()).toEqual([]);
  });
  it("checks actual reachable and selected optional templates without choosing presentation or invoking policy", async () => {
    const policy = jest.fn(async () => experienceIdSchema.parse("radar"));
    const app = createBackendApp(
      {
        db: { client },
        app: {
          experiences: {
            ...experienceConfig,
            emailProfiles: { assistant: { templateSet: "assistant" } },
            definitions: {
              ...experienceConfig.definitions,
              horeka: { ...experienceConfig.definitions.horeka, emailProfile: "assistant" },
            },
          },
        },
        email: { mode: "store", outputDirectory },
      },
      [
        new EmailModule(templates, {
          communicationPolicy: policy,
          templateSets: {
            assistant: { ...templates, trialEnding: { ...report, id: "assistant-trial" } },
          },
        }),
      ] as const
    );
    const email = app.modules.email.services.email;
    expect(
      (await email.hasTemplate({ scope: "any", templateKey: "trialEnding" }))._unsafeUnwrap()
    ).toBe(true);
    expect(
      (
        await email.hasTemplate({
          scope: "experience",
          templateKey: "trialEnding",
          experienceId: experienceIdSchema.parse("horeka"),
        })
      )._unsafeUnwrap()
    ).toBe(true);
    expect(
      (
        await email.hasTemplate({
          scope: "experience",
          templateKey: "trialEnding",
          experienceId: experienceIdSchema.parse("radar"),
        })
      )._unsafeUnwrap()
    ).toBe(false);
    expect(
      (
        await email.sendTemplate(
          "selected@example.test",
          "trialEnding",
          {},
          { experience: "horeka", linkPaths: { url: "/billing" } }
        )
      ).isOk()
    ).toBe(true);
    const stored = await email.findLatestStoredEmail({ to: "selected@example.test" });
    expect(stored?.templateId).toBe("assistant-trial");
    expect(stored?.html).toContain("Horeka AI");
    expect(
      (
        await email.sendTemplate("missing@example.test", "trialEnding", {}, { experience: "radar" })
      ).isErr()
    ).toBe(true);
    expect(policy).not.toHaveBeenCalled();
  });
  it("reports invalid selected availability as an error and preserves manual legacy availability", () => {
    const email = build(undefined, {
      experiences: {
        ...experienceConfig,
        definitions: {
          ...experienceConfig.definitions,
          horeka: { ...experienceConfig.definitions.horeka, disabled: true },
        },
      },
    });
    expect(email.hasTemplate({ scope: "any", templateKey: "trialEnding" })._unsafeUnwrap()).toBe(
      false
    );
    for (const id of ["horeka", "removed"])
      expect(
        email
          .hasTemplate({
            scope: "experience",
            templateKey: "trialEnding",
            experienceId: experienceIdSchema.parse(id),
          })
          .isErr()
      ).toBe(true);
    expect(
      email
        .hasTemplate(
          JSON.parse('{"scope":"any","templateKey":"trialEnding","experienceId":"radar"}')
        )
        .isErr()
    ).toBe(true);
    const manual = new EmailService({
      templates: { ...templates, trialEnding: report },
      mode: "store",
      outputDirectory,
    });
    expect(manual.hasTemplate({ scope: "any", templateKey: "trialEnding" })._unsafeUnwrap()).toBe(
      true
    );
    expect(
      manual
        .hasTemplate({
          scope: "experience",
          templateKey: "trialEnding",
          experienceId: experienceIdSchema.parse("radar"),
        })
        .isErr()
    ).toBe(true);
  });
});
