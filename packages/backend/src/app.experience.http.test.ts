import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createBackendApp, defineBackendModule } from "./app";
import { ExperienceRegistry } from "./experience";
import { ExperienceFlowSigner } from "./experience-flows";
import { createTestPool } from "./test/postgresql";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: { serialize: (value: unknown) => value, deserialize: (value: unknown) => value },
}));
jest.mock("better-auth/node", () => ({ toNodeHandler: () => () => undefined }));

// Node's fetch discards Host overrides; use the HTTP boundary that actually transmits them.
function visit(base: string, host: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(`${base}/app/experience`, { headers: { host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve(
          new Response(Buffer.concat(chunks), {
            status: res.statusCode,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.join(", ") : (value ?? ""),
              ])
            ),
          })
        )
      );
    });
    req.on("error", reject);
    req.end();
  });
}

export const experienceFixture = {
  defaultExperience: "radar",
  brands: {
    radar: { name: "Gastro Raider" },
    horeka: { name: "Horeka AI" },
    partner: { name: "Partner Radar" },
  },
  definitions: {
    radar: {
      product: "radar",
      brand: "radar",
      webOrigin: "https://radar.example.test",
      apiOrigin: "https://radar.example.test",
    },
    horeka: {
      product: "horeka",
      brand: "horeka",
      webOrigin: "https://horeka.example.test",
      apiOrigin: "https://horeka.example.test",
    },
    partner: {
      product: "radar",
      brand: "partner",
      webOrigin: "https://partner.example.test",
      apiOrigin: "https://partner.example.test",
    },
  },
};

describe("domain-selected public Experience", () => {
  it("injects one stable flow signer into services and the auth factory without publishing its secret", async () => {
    const client = createTestPool();
    let authFlows: unknown;
    const probe = defineBackendModule({
      id: "flow-probe",
      services({ infra }) {
        return { probe: { flows: "experienceFlows" in infra ? infra.experienceFlows : undefined } };
      },
    });
    const config = {
      db: { client },
      app: { experiences: experienceFixture },
      experienceFlowSecret: "a-stable-flow-key-at-least-thirty-two-characters",
      experienceFlowLegacyPolicy: {
        experience: "radar",
        issuedBefore: new Date(Date.now() - 5000),
        acceptUntil: new Date(Date.now() + 60000),
      },
      auth: {
        factory(ctx: Record<string, unknown>) {
          authFlows = ctx.experienceFlows;
          return { api: {}, options: {} } as never;
        },
      },
    };
    const built = createBackendApp(config, [probe]);
    try {
      const flows = built.modules["flow-probe"].services.probe.flows;
      expect(flows).toBeInstanceOf(ExperienceFlowSigner);
      expect(authFlows).toBe(flows);
      if (!flows) throw new Error("Flow infrastructure was not injected");
      expect(
        flows.verifyLegacy({ issuedAt: Date.now() - 10000, destination: "/legacy" }).destination
      ).toBe("https://radar.example.test/legacy");
      expect(JSON.stringify(built.config.app)).not.toContain(config.experienceFlowSecret);
    } finally {
      await built.shutdown();
      await client.end();
    }
  });
  it("disambiguates shared APIs only with configured Origin pairs and preserves canonical aliases", () => {
    const registry = new ExperienceRegistry({
      ...experienceFixture,
      definitions: Object.fromEntries(
        Object.entries(experienceFixture.definitions).map(([key, value]) => [
          key,
          {
            ...value,
            apiOrigin: "https://api.example.test",
            aliases: key === "radar" ? ["https://www.radar.example.test"] : [],
          },
        ])
      ),
    });
    expect(
      registry.resolveRequest({
        headers: { host: "api.example.test", origin: "https://horeka.example.test" },
      })?.id
    ).toBe("horeka");
    expect(registry.resolveRequest({ headers: { host: "api.example.test" } })).toBeUndefined();
    expect(
      registry.resolveRequest({ headers: { host: "www.radar.example.test" } })?.webOrigin
    ).toBe("https://radar.example.test");
    expect(() =>
      registry.resolveRequest({
        headers: { host: "radar.example.test", origin: "https://horeka.example.test" },
      })
    ).toThrow(/Conflicting/);
    expect(() =>
      registry.resolveRequest({
        headers: { host: "unregistered.test", "x-forwarded-host": "radar.example.test" },
      })
    ).toThrow(/Unknown/);
    expect(() => registry.require()).toThrow(/required/);
  });
  it("rejects an API authority owned by a different web Experience", () => {
    expect(
      () =>
        new ExperienceRegistry({
          ...experienceFixture,
          definitions: {
            ...experienceFixture.definitions,
            horeka: {
              ...experienceFixture.definitions.horeka,
              apiOrigin: "https://radar.example.test",
            },
          },
        })
    ).toThrow(/Ambiguous/);
  });
  it("returns distinct public identities before login without granting capabilities", async () => {
    const client = createTestPool();
    const built = createBackendApp({ db: { client }, app: { experiences: experienceFixture } });
    const server = await new Promise<Server>((resolve) => {
      const listening = built.express.app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      for (const [host, id, product, name] of [
        ["radar.example.test", "radar", "radar", "Gastro Raider"],
        ["horeka.example.test", "horeka", "horeka", "Horeka AI"],
        ["partner.example.test", "partner", "radar", "Partner Radar"],
      ]) {
        const response = await visit(base, host);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          id,
          product,
          brand: { name },
          webOrigin: `https://${host}`,
          apiOrigin: `https://${host}`,
        });
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
      const unknown = await visit(base, "evil.example.test");
      expect(unknown.status).toBe(400);
      expect(unknown.headers.get("location")).toBeNull();
      expect(unknown.headers.get("set-cookie")).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await built.shutdown();
      await client.end();
    }
  });
});
