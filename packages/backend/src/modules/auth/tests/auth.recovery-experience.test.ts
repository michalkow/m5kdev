import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { createElement } from "react";
import { ExperienceRegistry } from "../../../experience";
import { ExperienceFlowSigner } from "../../../experience-flows";
import { createAppI18n } from "../../../i18n/app-i18n";
import { experienceConfig, prepareExperienceTables } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { EmailService, type EmailTemplates } from "../../email/email.service";
import * as schema from "../auth.db";
import { createBetterAuth } from "../auth.lib";

const SECRET = "recovery-test-secret-at-least-thirty-two-characters";
const ORIGINAL_PASSWORD = "Original-Password-123";

async function fixture(
  options: { verified?: boolean; sharedApi?: boolean; legacy?: boolean } = {}
) {
  const client = createTestPool();
  await prepareExperienceTables(client, schema);
  const orm = drizzle(client, { schema });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "m5kdev-recovery-"));
  const registry = new ExperienceRegistry({
    ...experienceConfig,
    emailProfiles: {
      radar: { from: "Radar <radar@example.test>" },
      horeka: { from: "Horeka <horeka@example.test>" },
    },
    definitions: {
      ...experienceConfig.definitions,
      radar: {
        ...experienceConfig.definitions.radar,
        aliases: ["https://alias-radar.example.test"],
        ...(options.sharedApi ? { apiOrigin: "https://api.example.test" } : {}),
        emailProfile: "radar",
      },
      horeka: {
        ...experienceConfig.definitions.horeka,
        ...(options.sharedApi ? { apiOrigin: "https://api.example.test" } : {}),
        emailProfile: "horeka",
      },
    },
  });
  const render = (props: Record<string, unknown>) =>
    createElement("a", { href: String(props.url) }, JSON.stringify(props.brand));
  const template = { id: "recovery", react: render };
  const templates: EmailTemplates = {
    verification: template,
    passwordReset: template,
    accountDeletion: template,
    organizationInvite: template,
  };
  const app = {
    urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
    experienceRegistry: options.legacy ? undefined : registry,
  };
  const i18n = createAppI18n(
    {
      defaultLocale: "en",
      locales: [
        { code: "en", displayName: "English" },
        { code: "en_GB", displayName: "English (UK)" },
      ],
    },
    {}
  );
  const email = new EmailService({
    templates,
    appConfig: app,
    emailConfig: {
      mode: "store",
      outputDirectory: directory,
      from: "Legacy <legacy@example.test>",
    },
    i18n,
  });
  const flows = new ExperienceFlowSigner(registry, SECRET);
  const auth = createBetterAuth({
    orm,
    schema,
    services: { email },
    app,
    experienceFlows: flows,
    i18n,
    options: { secret: SECRET, rateLimit: { enabled: false } },
  });
  for (const id of ["radar", "horeka"]) {
    await orm.insert(schema.users).values({
      id,
      email: `${id}@example.test`,
      name: `${id} user`,
      emailVerified: options.verified ?? true,
      locale: "en_GB",
    });
    await orm.insert(schema.accounts).values({
      id,
      providerId: "credential",
      accountId: id,
      userId: id,
      password: await hashPassword(ORIGINAL_PASSWORD),
    });
  }
  const request = (id: string, route: string, body: Record<string, unknown>) =>
    new Request(`https://${options.sharedApi ? "api" : id}.example.test/api/auth${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: `${options.sharedApi ? "api" : id}.example.test`,
        origin: `https://${id}.example.test`,
      },
      body: JSON.stringify(body),
    });
  return {
    auth,
    email,
    registry,
    flows,
    orm,
    request,
    close: async () => {
      await client.end();
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

describe("Experience-bound recovery", () => {
  it("uses canonical API and web origins when recovery starts on an allowed alias", async () => {
    const f = await fixture();
    try {
      const response = await f.auth.handler(
        new Request("https://alias-radar.example.test/api/auth/request-password-reset", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            host: "alias-radar.example.test",
            origin: "https://alias-radar.example.test",
          },
          body: JSON.stringify({ email: "radar@example.test", redirectTo: "/reset-password" }),
        })
      );
      expect(response.status).toBe(200);
      const stored = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      const link = new URL(String(stored?.props.url));
      expect(link.origin).toBe("https://radar.example.test");
      expect(new URL(String(link.searchParams.get("callbackURL"))).origin).toBe(
        "https://radar.example.test"
      );
    } finally {
      await f.close();
    }
  });
  it("rejects missing signing infrastructure when strict recovery email is configured", async () => {
    const f = await fixture();
    try {
      expect(() =>
        createBetterAuth({
          orm: f.orm,
          schema,
          services: { email: f.email },
          app: {
            experienceRegistry: f.registry,
            urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
          },
          options: { secret: SECRET },
        })
      ).toThrow("Experience flow signing is required");
    } finally {
      await f.close();
    }
  });
  it("returns a safe input error for a malformed return URL instead of leaking a URL TypeError", async () => {
    const f = await fixture();
    try {
      const response = await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "http://[",
        })
      );
      expect(response.status).toBe(400);
      expect(await f.email.listStoredEmails()).toEqual([]);
    } finally {
      await f.close();
    }
  });
  it("retains raw outstanding reset links under the single-Experience authoring form", async () => {
    const f = await fixture({ legacy: true });
    try {
      await f.auth.handler(
        f.request("radar", "/request-password-reset", {
          email: "radar@example.test",
          redirectTo: "https://radar.example.test/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      expect(stored?.from).toBe("Legacy <legacy@example.test>");
      expect(String(stored?.props.url)).not.toContain("experienceFlow");
      const followed = await f.auth.handler(new Request(String(stored?.props.url)));
      const destination = new URL(String(followed.headers.get("location")));
      expect(destination.origin).toBe("https://radar.example.test");
      await expect(
        f.auth.api.resetPassword({
          body: {
            token: String(destination.searchParams.get("token")),
            newPassword: "Changed-Password-456",
          },
        })
      ).resolves.toEqual({ status: true });
    } finally {
      await f.close();
    }
  });
  it("accepts a pre-cutover raw reset link only under an explicit bounded legacy policy", async () => {
    const f = await fixture({ legacy: true });
    try {
      jest.useFakeTimers({
        now: Date.now() - 10000,
        doNotFake: [
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "setImmediate",
          "clearImmediate",
          "nextTick",
          "queueMicrotask",
          "performance",
          "hrtime",
        ],
      });
      try {
        await f.auth.handler(
          f.request("radar", "/request-password-reset", {
            email: "radar@example.test",
            redirectTo: "/reset-password",
          })
        );
      } finally {
        jest.useRealTimers();
      }
      const stored = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      const legacyPolicy = {
        experience: "radar",
        issuedBefore: new Date(Date.now() - 5000),
        acceptUntil: new Date(Date.now() + 60000),
      };
      const adopted = createBetterAuth({
        orm: f.orm,
        schema,
        services: { email: f.email },
        app: {
          experienceRegistry: f.registry,
          urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
        },
        experienceFlows: new ExperienceFlowSigner(f.registry, SECRET, { legacyPolicy }),
        options: { secret: SECRET, rateLimit: { enabled: false } },
      });
      const callback = await adopted.handler(new Request(String(stored?.props.url)));
      expect(callback.status).toBe(302);
      const destination = new URL(String(callback.headers.get("location")));
      expect(destination.href).toContain("https://radar.example.test/reset-password?token=");
      const token = String(destination.searchParams.get("token"));
      const changedDestination = new URL(String(stored?.props.url));
      changedDestination.searchParams.set(
        "callbackURL",
        "https://horeka.example.test/reset-password"
      );
      expect((await adopted.handler(new Request(changedDestination))).status).toBe(400);
      const deadline = jest
        .spyOn(Date, "now")
        .mockReturnValue(legacyPolicy.acceptUntil.getTime() + 1);
      try {
        await expect(
          adopted.api.resetPassword({
            headers: new Headers({ host: "radar.example.test" }),
            body: { token, newPassword: "Changed-Password-456" },
          })
        ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      } finally {
        deadline.mockRestore();
      }
      await expect(
        adopted.api.resetPassword({
          headers: new Headers({
            host: "radar.example.test",
            "X-M5kdev-Experience-Flow": "invalid",
          }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      await expect(
        adopted.api.resetPassword({
          headers: new Headers({ host: "horeka.example.test" }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      await expect(
        adopted.api.resetPassword({
          headers: new Headers({ host: "radar.example.test" }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).resolves.toEqual({ status: true });
      await expect(
        adopted.api.resetPassword({
          headers: new Headers({ host: "radar.example.test" }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    } finally {
      await f.close();
    }
  });
  it("admits old verification JWTs under the fixed legacy policy while upstream still rejects forged signatures", async () => {
    const f = await fixture({ legacy: true, verified: false });
    try {
      jest.useFakeTimers({
        now: Date.now() - 10000,
        doNotFake: [
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "setImmediate",
          "clearImmediate",
          "nextTick",
          "queueMicrotask",
          "performance",
          "hrtime",
        ],
      });
      try {
        await f.auth.handler(
          f.request("radar", "/send-verification-email", {
            email: "radar@example.test",
            callbackURL: "/verified",
          })
        );
      } finally {
        jest.useRealTimers();
      }
      const stored = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      const link = new URL(String(stored?.props.url));
      const adopted = createBetterAuth({
        orm: f.orm,
        schema,
        services: { email: f.email },
        app: {
          experienceRegistry: f.registry,
          urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
        },
        experienceFlows: new ExperienceFlowSigner(f.registry, SECRET, {
          legacyPolicy: {
            experience: "radar",
            issuedBefore: new Date(Date.now() - 5000),
            acceptUntil: new Date(Date.now() + 60000),
          },
        }),
        options: { secret: SECRET, rateLimit: { enabled: false } },
      });
      const parts = String(link.searchParams.get("token")).split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      parts[1] = Buffer.from(JSON.stringify({ ...payload, email: "horeka@example.test" })).toString(
        "base64url"
      );
      const forged = new URL(link);
      forged.searchParams.set("token", parts.join("."));
      const denied = await adopted.handler(new Request(forged));
      expect(denied.status).toBe(302);
      expect(denied.headers.get("location")).toBe(
        "https://radar.example.test/verified?error=INVALID_TOKEN"
      );
      expect(
        (
          await adopted.handler(
            f.request("horeka", "/sign-in/email", {
              email: "horeka@example.test",
              password: ORIGINAL_PASSWORD,
            })
          )
        ).status
      ).toBe(403);
      const verified = await adopted.api.verifyEmail({
        asResponse: true,
        headers: new Headers({ host: "radar.example.test" }),
        query: { token: String(link.searchParams.get("token")), callbackURL: "/verified" },
      });
      expect(verified.status).toBe(302);
      expect(verified.headers.get("location")).toBe("https://radar.example.test/verified");
      expect(
        (
          await adopted.handler(
            f.request("radar", "/sign-in/email", {
              email: "radar@example.test",
              password: ORIGINAL_PASSWORD,
            })
          )
        ).status
      ).toBe(200);
    } finally {
      await f.close();
    }
  });
  it("rejects unsigned post-cutover reset and verification tokens even when legacy admission is configured", async () => {
    const f = await fixture({ legacy: true, verified: false });
    try {
      const adopted = createBetterAuth({
        orm: f.orm,
        schema,
        services: { email: f.email },
        app: {
          experienceRegistry: f.registry,
          urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
        },
        experienceFlows: new ExperienceFlowSigner(f.registry, SECRET, {
          legacyPolicy: {
            experience: "radar",
            issuedBefore: new Date(Date.now() - 5000),
            acceptUntil: new Date(Date.now() + 60000),
          },
        }),
        options: { secret: SECRET, rateLimit: { enabled: false } },
      });
      await f.auth.handler(
        f.request("radar", "/request-password-reset", {
          email: "radar@example.test",
          redirectTo: "/reset-password",
        })
      );
      const reset = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      const rawReset = new URL(String(reset?.props.url));
      expect((await adopted.handler(new Request(rawReset))).status).toBe(400);
      const token = rawReset.pathname.split("/").at(-1);
      await expect(
        adopted.api.resetPassword({
          headers: new Headers({ host: "radar.example.test" }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      await f.auth.handler(
        f.request("radar", "/send-verification-email", {
          email: "radar@example.test",
          callbackURL: "/verified",
        })
      );
      const verification = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      expect((await adopted.handler(new Request(String(verification?.props.url)))).status).toBe(
        400
      );
    } finally {
      await f.close();
    }
  });
  it("does not accept a previously issued link after its Experience is disabled", async () => {
    const f = await fixture();
    try {
      await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      const disabled = new ExperienceRegistry({
        ...f.registry.config,
        definitions: {
          ...f.registry.config.definitions,
          horeka: { ...f.registry.config.definitions.horeka, disabled: true },
        },
      });
      const auth = createBetterAuth({
        orm: f.orm,
        schema,
        services: { email: f.email },
        app: {
          experienceRegistry: disabled,
          urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
        },
        experienceFlows: new ExperienceFlowSigner(disabled, SECRET),
        options: { secret: SECRET, rateLimit: { enabled: false } },
      });
      const response = await auth.handler(new Request(String(stored?.props.url)));
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    } finally {
      await f.close();
    }
  });
  it("verifies concurrent A/B email links with preserved locale and rejects cross-token continuation swaps", async () => {
    const f = await fixture({ verified: false });
    try {
      const results = await Promise.all(
        ["radar", "horeka"].map((id) =>
          f.auth.handler(
            f.request(id, "/send-verification-email", {
              email: `${id}@example.test`,
              callbackURL: "/verified",
            })
          )
        )
      );
      expect(results.map((result) => result.status)).toEqual([200, 200]);
      const radar = await f.email.findLatestStoredEmail({ to: "radar@example.test" });
      const horeka = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      expect(radar?.from).toBe("Radar <radar@example.test>");
      expect(horeka?.from).toBe("Horeka <horeka@example.test>");
      expect(radar?.props.htmlLang).toBe("en-GB");
      expect(horeka?.props.htmlLang).toBe("en-GB");
      expect(radar?.html).toContain("Gastro Raider");
      expect(horeka?.html).toContain("Horeka AI");
      const swapped = new URL(String(horeka?.props.url));
      swapped.searchParams.set(
        "token",
        String(new URL(String(radar?.props.url)).searchParams.get("token"))
      );
      expect((await f.auth.handler(new Request(swapped))).status).toBe(400);
      for (const [id, message] of [
        ["radar", radar],
        ["horeka", horeka],
      ] as const) {
        const response = await f.auth.handler(new Request(String(message?.props.url)));
        expect(response.status).toBe(302);
        expect(new URL(String(response.headers.get("location"))).origin).toBe(
          `https://${id}.example.test`
        );
        expect(
          (
            await f.auth.handler(
              f.request(id, "/sign-in/email", {
                email: `${id}@example.test`,
                password: ORIGINAL_PASSWORD,
              })
            )
          ).status
        ).toBe(200);
      }
    } finally {
      await f.close();
    }
  });
  it("rejects expired continuations before accepting a live underlying reset token", async () => {
    const f = await fixture();
    try {
      await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      const clock = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 3600001);
      try {
        expect((await f.auth.handler(new Request(String(stored?.props.url)))).status).toBe(400);
      } finally {
        clock.mockRestore();
      }
      expect((await f.auth.handler(new Request(String(stored?.props.url)))).status).toBe(302);
    } finally {
      await f.close();
    }
  });
  it("uses a bound proof on a shared API without Origin only for a registered API/Experience pair", async () => {
    const f = await fixture({ sharedApi: true });
    try {
      await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      const followed = await f.auth.handler(new Request(String(stored?.props.url)));
      expect(followed.status).toBe(302);
      const destination = new URL(String(followed.headers.get("location")));
      const token = String(destination.searchParams.get("token"));
      const proof = String(destination.searchParams.get("experienceFlow"));
      const partner = f.registry.get("partner");
      const wrongPair = f.flows.sign({
        purpose: "reset-password",
        token,
        experience: partner,
        destination: `${partner.webOrigin}/reset-password`,
        expiresAt: Date.now() + 60000,
      });
      await expect(
        f.auth.api.resetPassword({
          headers: new Headers({ host: "api.example.test", "X-M5kdev-Experience-Flow": wrongPair }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      await expect(
        f.auth.api.resetPassword({
          headers: new Headers({ host: "api.example.test", "X-M5kdev-Experience-Flow": proof }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).resolves.toEqual({ status: true });
    } finally {
      await f.close();
    }
  });
  it("rejects noncanonical signed-proof encodings before consuming the reset token", async () => {
    const f = await fixture();
    try {
      await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      const followed = await f.auth.handler(new Request(String(stored?.props.url)));
      const destination = new URL(String(followed.headers.get("location")));
      const token = String(destination.searchParams.get("token"));
      const proof = String(destination.searchParams.get("experienceFlow"));
      for (const invalid of [
        `${proof}.`,
        `${proof}..junk`,
        `${proof}!`,
        `${proof}=`,
        ".",
        "invalid",
      ]) {
        await expect(
          f.auth.api.resetPassword({
            headers: new Headers({
              host: "horeka.example.test",
              "X-M5kdev-Experience-Flow": invalid,
            }),
            body: { token, newPassword: "Changed-Password-456" },
          })
        ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      }
      await expect(
        f.auth.api.resetPassword({
          headers: new Headers({ host: "horeka.example.test", "X-M5kdev-Experience-Flow": proof }),
          body: { token, newPassword: "Changed-Password-456" },
        })
      ).resolves.toEqual({ status: true });
    } finally {
      await f.close();
    }
  });
  it("sends direct API recovery requests using their validated headers rather than a global brand", async () => {
    const f = await fixture();
    try {
      await f.auth.api.requestPasswordReset({
        headers: new Headers({
          host: "horeka.example.test",
          origin: "https://horeka.example.test",
        }),
        body: { email: "horeka@example.test", redirectTo: "/reset-password" },
      });
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      expect(stored?.from).toBe("Horeka <horeka@example.test>");
    } finally {
      await f.close();
    }
  });
  it("requires the bound proof on direct and HTTP reset calls, changes the password once and retains the product", async () => {
    const f = await fixture();
    try {
      await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      const followed = await f.auth.handler(new Request(String(stored?.props.url)));
      expect(followed.status).toBe(302);
      const destination = new URL(String(followed.headers.get("location")));
      expect(destination.origin).toBe("https://horeka.example.test");
      const token = String(destination.searchParams.get("token"));
      const proof = String(destination.searchParams.get("experienceFlow"));
      const newPassword = "Changed-Password-456";
      const headers = new Headers({
        host: "horeka.example.test",
        origin: "https://horeka.example.test",
      });
      await expect(
        f.auth.api.resetPassword({ headers, body: { token, newPassword } })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
      const missing = await f.auth.handler(
        f.request("horeka", "/reset-password", { token, newPassword })
      );
      expect(missing.status).toBe(400);
      headers.set("X-M5kdev-Experience-Flow", proof);
      await expect(
        f.auth.api.resetPassword({ headers, body: { token, newPassword } })
      ).resolves.toEqual({ status: true });
      const signedIn = await f.auth.handler(
        f.request("horeka", "/sign-in/email", {
          email: "horeka@example.test",
          password: newPassword,
        })
      );
      expect(signedIn.status).toBe(200);
      await expect(
        f.auth.api.resetPassword({ headers, body: { token, newPassword } })
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    } finally {
      await f.close();
    }
  });
  it("rejects a reset callback whose bound destination was changed to another Experience", async () => {
    const f = await fixture();
    try {
      await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      const edited = new URL(String(stored?.props.url));
      const callback = new URL(String(edited.searchParams.get("callbackURL")));
      callback.hostname = "radar.example.test";
      edited.searchParams.set("callbackURL", callback.href);
      const response = await f.auth.handler(new Request(edited));
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    } finally {
      await f.close();
    }
  });
  it("issues the entered Experience's rendered reset email with a bound continuation", async () => {
    const f = await fixture();
    try {
      const response = await f.auth.handler(
        f.request("horeka", "/request-password-reset", {
          email: "horeka@example.test",
          redirectTo: "/reset-password",
        })
      );
      expect(response.status).toBe(200);
      const stored = await f.email.findLatestStoredEmail({ to: "horeka@example.test" });
      expect(stored?.from).toBe("Horeka <horeka@example.test>");
      expect(stored?.html).toContain("Horeka AI");
      const link = new URL(String(stored?.props.url));
      expect(link.origin).toBe("https://horeka.example.test");
      const callback = new URL(String(link.searchParams.get("callbackURL")));
      expect(callback.origin).toBe("https://horeka.example.test");
      expect(callback.pathname).toBe("/reset-password");
      expect(callback.searchParams.get("experienceFlow")).toMatch(/\S+\.\S+/);
    } finally {
      await f.close();
    }
  });
});
