import fs from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import type { Express } from "express";
import type { FunctionComponent } from "react";
import { createBackendApp } from "../../../app";
import { EmailModule } from "../email.module";
import { EmailPreviewModule } from "../email.preview.module";
import type { EmailService, EmailTemplates } from "../email.service";

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
  accountDeletion: { id: "account-deletion", react: Template },
  verification: { id: "verification", react: Template },
  waitlistConfirmation: { id: "waitlist-confirmation", react: Template },
  passwordReset: { id: "password-reset", react: Template },
  systemWaitlistNotification: { id: "system-waitlist-notification", react: Template },
  waitlistInvite: { id: "waitlist-invite", react: Template },
  waitlistUserInvite: { id: "waitlist-user-invite", react: Template },
  organizationInvite: { id: "organization-invite", react: Template },
};

async function withServer(app: Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => {
      resolve(listening);
    });
    listening.on("error", reject);
  });

  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

describe("EmailPreviewModule HTTP", () => {
  let client: Client;
  let outputDirectory: string;
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-email-preview-"));
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    process.env.NODE_ENV = previousNodeEnv;
    await client.close?.();
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  it("serves the stored-email inbox in store mode when env is not production", async () => {
    const built = createBackendApp(
      {
        db: { client },
        app: {
          urls: { web: "http://localhost:5173" },
        },
        email: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
      },
      [new EmailModule(templates), new EmailPreviewModule()] as const
    );

    const email = built.modules.email.services.email as EmailService;
    const sent = await email.sendVerification("person@example.com", "https://example.com/verify");
    expect(sent.isOk()).toBe(true);

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/__emails`);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("Stored emails");
      expect(body).toContain("verification");
    });
  });

  it("does not mount preview when mode is send", async () => {
    const built = createBackendApp(
      {
        db: { client },
        app: {
          urls: { web: "http://localhost:5173" },
        },
        email: {
          mode: "send",
          from: "no-reply@example.com",
          outputDirectory,
        },
      },
      [new EmailModule(templates), new EmailPreviewModule()] as const
    );

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/__emails`);
      expect(response.status).toBe(404);
    });
  });

  it("does not mount preview in production even when mode is store", async () => {
    process.env.NODE_ENV = "production";

    const built = createBackendApp(
      {
        db: { client },
        app: {
          urls: { web: "http://localhost:5173" },
        },
        email: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
      },
      [new EmailModule(templates), new EmailPreviewModule()] as const
    );

    await withServer(built.express.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/__emails`);
      expect(response.status).toBe(404);
    });
  });

  it("uses mountPath in inbox and detail links", async () => {
    const mountPath = "/mail-preview";
    const built = createBackendApp(
      {
        db: { client },
        app: {
          urls: { web: "http://localhost:5173" },
        },
        email: {
          mode: "store",
          from: "no-reply@example.com",
          outputDirectory,
        },
      },
      [new EmailModule(templates), new EmailPreviewModule({ mountPath })] as const
    );

    const email = built.modules.email.services.email as EmailService;
    const sent = await email.sendVerification("person@example.com", "https://example.com/verify");
    expect(sent.isOk()).toBe(true);

    await withServer(built.express.app, async (baseUrl) => {
      const inbox = await fetch(`${baseUrl}${mountPath}`);
      expect(inbox.status).toBe(200);
      const inboxHtml = await inbox.text();
      expect(inboxHtml).toContain(`${mountPath}/`);
      expect(inboxHtml).not.toContain("/__emails");

      const detailHref = inboxHtml.match(/href="(\/mail-preview\/[^"]+)"/)?.[1];
      expect(detailHref).toBeDefined();

      const detail = await fetch(`${baseUrl}${detailHref}`);
      expect(detail.status).toBe(200);
      const detailHtml = await detail.text();
      expect(detailHtml).toContain(`${mountPath}/`);
      expect(detailHtml).not.toContain("/__emails");
    });
  });
});
