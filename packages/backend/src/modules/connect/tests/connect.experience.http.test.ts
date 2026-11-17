import { createHash } from "node:crypto";
import { createBackendApp } from "../../../app";
import {
  connectListPath,
  connectionFixture as fixture,
  readConnectTRPC,
  schema,
} from "../../../test/connect.fixtures";
import { experienceConfig } from "../../../test/experience.fixtures";
import { createTestPool } from "../../../test/postgresql";
import { createGoogleProvider } from "../connect.google";
import { defaultConnectGrants } from "../connect.grants";
import { createLinkedInProvider } from "../connect.linkedin";
import { ConnectModule } from "../connect.module";
import { createConnectRouter } from "../connect.router";
import { ConnectService } from "../connect.service";

describe("Experience-bound Connection HTTP flow", () => {
  it("starts and completes A/B authorization using configured canonical callbacks and stored local destinations", async () => {
    const f = await fixture();
    try {
      for (const id of ["radar", "horeka", "partner"]) {
        const cookie = await f.login(id);
        const started = await f.visit(
          `${id}.example.test`,
          "/connections/recording/start?redirect=%2Fsettings%3Ftab%3Dconnections",
          { cookie }
        );
        expect(started.status).toBe(302);
        const authorization = new URL(String(started.headers.get("location")));
        expect(authorization.origin).toBe("https://provider.example.test");
        expect(authorization.searchParams.get("redirect_uri")).toBe(
          `https://${id}.example.test/connections/recording/callback`
        );
        expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
        const callback = await f.visit(
          `${id}.example.test`,
          `/connections/recording/callback?code=accepted&state=${authorization.searchParams.get("state")}`,
          { cookie }
        );
        expect(callback.status).toBe(302);
        expect(callback.headers.get("location")).toBe(
          `https://${id}.example.test/settings?tab=connections&connect_success=true&provider=recording`
        );
        expect(f.exchanges.at(-1)?.get("redirect_uri")).toBe(
          `https://${id}.example.test/connections/recording/callback`
        );
        expect(
          createHash("sha256")
            .update(String(f.exchanges.at(-1)?.get("code_verifier")))
            .digest("base64url")
        ).toBe(authorization.searchParams.get("code_challenge"));
        const listed = await f.visit(`${id}.example.test`, connectListPath, {
          cookie,
        });
        expect(listed.status).toBe(200);
        const data = await readConnectTRPC(listed);
        expect(data).toMatchObject({
          result: {
            data: [
              {
                userId: "person",
                provider: "recording",
                displayName: "External Person",
              },
            ],
          },
        });
        expect(JSON.stringify(data)).not.toMatch(/accessToken|refreshToken|recorded-access-token/);
      }
    } finally {
      await f.close();
    }
  });
  it("keeps concurrent A/B starts for the same shared-API session and provider independent", async () => {
    const f = await fixture({ topology: "shared" });
    try {
      const cookie = await f.login("radar");
      const starts = await Promise.all(
        ["radar", "horeka"].map((id) =>
          f.visit("api.example.test", "/connections/recording/start?redirect=%2Fconnections", {
            cookie,
            origin: `https://${id}.example.test`,
          })
        )
      );
      const states = starts.map((response) =>
        new URL(String(response.headers.get("location"))).searchParams.get("state")
      );
      expect(states[0]).not.toBe(states[1]);
      for (const index of [1, 0]) {
        const response = await f.visit(
          "api.example.test",
          `/connections/recording/callback?state=${states[index]}&code=accepted`,
          { cookie }
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(
          `https://${["radar", "horeka"][index]}.example.test/connections?connect_success=true&provider=recording`
        );
      }
      expect(f.exchanges).toHaveLength(2);
    } finally {
      await f.close();
    }
  });

  it("rejects expired opaque state even before its cleanup timer runs", async () => {
    const f = await fixture();
    try {
      const cookie = await f.login("radar");
      const start = await f.visit("radar.example.test", "/connections/recording/start", { cookie });
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      const time = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 11 * 60 * 1000);
      try {
        const callback = await f.visit(
          "radar.example.test",
          `/connections/recording/callback?code=accepted&state=${state}`,
          { cookie }
        );
        expect(callback.status).toBe(400);
        expect(callback.headers.get("location")).toBeNull();
        expect(f.exchanges).toHaveLength(0);
      } finally {
        time.mockRestore();
      }
    } finally {
      await f.close();
    }
  });

  it("rejects protocol-relative returns even when they name the entered website", async () => {
    const f = await fixture();
    try {
      const cookie = await f.login("radar");
      const response = await f.visit(
        "radar.example.test",
        "/connections/recording/start?redirect=%2F%2Fradar.example.test%2Fsettings",
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(f.exchanges).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  it("derives built-in provider callbacks from app configuration without a singular server URL", async () => {
    const names = [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "LINKEDIN_CLIENT_ID",
      "LINKEDIN_CLIENT_SECRET",
      "VITE_SERVER_URL",
    ];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      for (const name of names) process.env[name] = "recorded-credential";
      delete process.env.VITE_SERVER_URL;
      for (const factory of [createGoogleProvider, createLinkedInProvider]) {
        const provider = factory();
        const f = await fixture({ provider });
        try {
          const cookie = await f.login("horeka");
          const start = await f.visit(
            "horeka.example.test",
            `/connections/${provider.id}/start?redirect=%2Fsettings`,
            { cookie }
          );
          const authorization = new URL(String(start.headers.get("location")));
          expect(authorization.searchParams.get("redirect_uri")).toBe(
            `https://horeka.example.test/connections/${provider.id}/callback`
          );
          const callback = await f.visit(
            "horeka.example.test",
            `/connections/${provider.id}/callback?state=${authorization.searchParams.get("state")}&code=accepted`,
            { cookie }
          );
          expect(callback.status).toBe(302);
          expect(callback.headers.get("location")).toBe(
            `https://horeka.example.test/settings?connect_success=true&provider=${provider.id}`
          );
          expect(f.exchanges[0]?.get("redirect_uri")).toBe(
            `https://horeka.example.test/connections/${provider.id}/callback`
          );
        } finally {
          await f.close();
        }
      }
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("rejects an unregistered provider callback topology at app boot", async () => {
    const pool = createTestPool();
    let shutdown: (() => Promise<void>) | undefined;
    try {
      expect(() => {
        const built = createBackendApp(
          {
            db: { client: pool },
            schema,
            app: { experiences: experienceConfig },
          },
          [
            new ConnectModule([
              createGoogleProvider({
                clientId: "recorded-client",
                clientSecret: "recorded-secret",
                redirectUri: "https://unregistered.example.test/connect/google/callback",
              }),
            ]),
          ]
        );
        shutdown = built.shutdown;
      }).toThrow("Connection callback must match its configured canonical API route");
    } finally {
      await shutdown?.();
      await pool.end();
    }
  });

  it("rejects authorization extras that replace the state or registered callback", async () => {
    const pool = createTestPool();
    let shutdown: (() => Promise<void>) | undefined;
    try {
      expect(() => {
        const provider = {
          ...createGoogleProvider({
            clientId: "recorded-client",
            clientSecret: "recorded-secret",
          }),
          authorizationExtraParams: {
            state: "poisoned",
            redirect_uri: "https://unregistered.example.test/callback",
          },
        };
        const built = createBackendApp(
          {
            db: { client: pool },
            schema,
            app: { experiences: experienceConfig },
          },
          [new ConnectModule([provider])]
        );
        shutdown = built.shutdown;
      }).toThrow("Reserved OAuth authorization parameter");
    } finally {
      await shutdown?.();
      await pool.end();
    }
  });

  it("consumes provider cancellation before returning to the stored brand and rejects its replay", async () => {
    const f = await fixture();
    try {
      const cookie = await f.login("horeka");
      const start = await f.visit(
        "horeka.example.test",
        "/connections/recording/start?redirect=%2Fsettings%3Ftab%3Dconnections",
        { cookie }
      );
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      const path = `/connections/recording/callback?state=${state}&error=access_denied&error_description=private-provider-details&experience=radar`;
      const failed = await f.visit("horeka.example.test", path, { cookie });
      expect(failed.status).toBe(302);
      expect(failed.headers.get("location")).toBe(
        "https://horeka.example.test/settings?tab=connections&error=CONNECTION_FAILED&provider=recording"
      );
      const replay = await f.visit("horeka.example.test", path, { cookie });
      expect(replay.status).toBe(400);
      expect(replay.headers.get("location")).toBeNull();
      expect(f.exchanges).toHaveLength(0);
      const listed = await f.visit("horeka.example.test", connectListPath, {
        cookie,
      });
      expect(await readConnectTRPC(listed)).toMatchObject({
        result: { data: [] },
      });
    } finally {
      await f.close();
    }
  });

  it("rejects callback/state/transport tampering before any provider exchange", async () => {
    const f = await fixture({ topology: "split" });
    try {
      const cookie = await f.login("radar");
      const otherSession = await f.login("radar");
      const otherUser = await f.login("radar", "other");
      const cases = [
        {
          host: "radar.example.test",
          suffix: "&redirect=https%3A%2F%2Fevil.example.test",
          cookie,
        },
        {
          host: "radar.example.test",
          suffix: "&redirect=%2Fother-path",
          cookie,
        },
        { host: "radar.example.test", suffix: "", cookie: otherSession },
        { host: "radar.example.test", suffix: "", cookie: otherUser },
        { host: "api.example.test", suffix: "", cookie },
        {
          host: "radar.example.test",
          suffix: "",
          cookie,
          provider: "other-provider",
        },
        { host: "radar.example.test", suffix: "", cookie, tamper: true },
      ];
      for (const scenario of cases) {
        const start = await f.visit(
          "radar.example.test",
          "/connections/recording/start?redirect=%2Fsettings",
          { cookie }
        );
        const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
        const response = await f.visit(
          scenario.host,
          `/connections/${scenario.provider ?? "recording"}/callback?code=accepted&state=${state}${scenario.tamper ? "changed" : ""}${scenario.suffix}`,
          { cookie: scenario.cookie }
        );
        expect(response.status).toBe(400);
        expect(response.headers.get("location")).toBeNull();
      }
      const noState = await f.visit(
        "radar.example.test",
        "/connections/recording/callback?error=access_denied&redirect=https%3A%2F%2Fevil.example.test",
        { cookie }
      );
      expect(noState.status).toBe(400);
      expect(noState.headers.get("location")).toBeNull();
      expect(f.exchanges).toHaveLength(0);
    } finally {
      await f.close();
    }
  });

  it("does not replace the bound Experience with a conflicting shared-API Origin", async () => {
    const f = await fixture({ topology: "shared" });
    try {
      const cookie = await f.login("horeka");
      const start = await f.visit("api.example.test", "/connections/recording/start", {
        cookie,
        origin: "https://horeka.example.test",
      });
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      const response = await f.visit(
        "api.example.test",
        `/connections/recording/callback?state=${state}&error=access_denied`,
        { cookie, origin: "https://radar.example.test" }
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      const neutralStart = await f.visit("api.example.test", "/connections/recording/start", {
        cookie,
      });
      expect(neutralStart.status).toBe(400);
      expect(neutralStart.headers.get("location")).toBeNull();
    } finally {
      await f.close();
    }
  });

  it("atomically consumes a successful state while reconnect preserves the User-owned row", async () => {
    const f = await fixture();
    try {
      const cookie = await f.login("radar");
      const start = await f.visit("radar.example.test", "/connections/recording/start", { cookie });
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      const path = `/connections/recording/callback?state=${state}&code=accepted`;
      const raced = await Promise.all([
        f.visit("radar.example.test", path, { cookie }),
        f.visit("radar.example.test", path, { cookie }),
      ]);
      expect(raced.map((response) => response.status).sort()).toEqual([302, 400]);
      expect(f.exchanges).toHaveLength(1);
      const firstList = await readConnectTRPC(
        await f.visit("radar.example.test", connectListPath, { cookie })
      );
      const firstId = firstList.result.data[0].id;
      const reconnect = await f.visit("radar.example.test", "/connections/recording/start", {
        cookie,
      });
      const secondState = new URL(String(reconnect.headers.get("location"))).searchParams.get(
        "state"
      );
      expect(
        (
          await f.visit(
            "radar.example.test",
            `/connections/recording/callback?state=${secondState}&code=reconnected`,
            { cookie }
          )
        ).status
      ).toBe(302);
      const secondList = await readConnectTRPC(
        await f.visit("radar.example.test", connectListPath, { cookie })
      );
      expect(secondList.result.data).toHaveLength(1);
      expect(secondList.result.data[0].id).toBe(firstId);
      const otherCookie = await f.login("radar", "other");
      const forbidden = await f.visit("radar.example.test", "/trpc/connect.delete", {
        cookie: otherCookie,
        method: "POST",
        body: { id: firstId },
      });
      expect(forbidden.status).toBe(403);
      const removed = await f.visit("radar.example.test", "/trpc/connect.delete", {
        cookie,
        method: "POST",
        body: { id: firstId },
      });
      expect(removed.status).toBe(200);
      const empty = await f.visit("radar.example.test", connectListPath, {
        cookie,
      });
      expect(await readConnectTRPC(empty)).toMatchObject({
        result: { data: [] },
      });
    } finally {
      await f.close();
    }
  });

  it.each(["exchange", "profile"] as const)(
    "returns a provider %s failure only to the stored product destination",
    async (providerFailure) => {
      const f = await fixture({ providerFailure });
      try {
        const cookie = await f.login("horeka");
        const start = await f.visit(
          "horeka.example.test",
          "/connections/recording/start?redirect=%2Fsettings",
          { cookie }
        );
        const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
        const response = await f.visit(
          "horeka.example.test",
          `/connections/recording/callback?state=${state}&code=accepted`,
          { cookie }
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(
          "https://horeka.example.test/settings?error=CONNECTION_FAILED&provider=recording"
        );
        const listed = await f.visit("horeka.example.test", connectListPath, {
          cookie,
        });
        expect(await readConnectTRPC(listed)).toMatchObject({
          result: { data: [] },
        });
      } finally {
        await f.close();
      }
    }
  );

  it("keeps unchanged shorthand and an explicitly registered callback query", async () => {
    const provider = {
      ...createGoogleProvider({
        clientId: "recorded-client",
        clientSecret: "recorded-secret",
        redirectUri: "https://radar.example.test/connections/google/callback?registered=1",
      }),
    };
    const f = await fixture({ legacy: true, provider });
    try {
      const cookie = await f.login("radar");
      const start = await f.visit(
        "radar.example.test",
        "/connections/google/start?redirect=%2Fsettings",
        { cookie }
      );
      const authorization = new URL(String(start.headers.get("location")));
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        "https://radar.example.test/connections/google/callback?registered=1"
      );
      const callback = await f.visit(
        "radar.example.test",
        `/connections/google/callback?registered=1&state=${authorization.searchParams.get("state")}&code=accepted`,
        { cookie }
      );
      expect(callback.headers.get("location")).toBe(
        "https://radar.example.test/settings?connect_success=true&provider=google"
      );
      expect(f.exchanges[0]?.get("redirect_uri")).toBe(
        "https://radar.example.test/connections/google/callback?registered=1"
      );
    } finally {
      await f.close();
    }
  });

  it.each(["alias", "web"] as const)(
    "rejects a host-only session started on the %s authority and requires canonical authenticated API initiation",
    async (entry) => {
      const f = await fixture({
        topology: entry === "web" ? "separate" : "domain",
      });
      try {
        const host = entry === "alias" ? "alias-radar.example.test" : "radar.example.test";
        const signedIn = await f.visit(host, "/api/auth/sign-in/email", {
          method: "POST",
          origin: `https://${host}`,
          body: {
            email: "person@example.test",
            password: "Original-Password-123",
          },
        });
        expect(signedIn.status).toBe(200);
        const cookie = signedIn.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
        const start = await f.visit(host, "/connections/recording/start", {
          cookie,
        });
        expect(start.status).toBe(400);
        expect(start.headers.get("location")).toBeNull();
        const canonicalCookie = await f.login("radar");
        const canonical = await f.visit(f.apiHost("radar"), "/connections/recording/start", {
          cookie: canonicalCookie,
          origin: "https://radar.example.test",
        });
        const authorization = new URL(String(canonical.headers.get("location")));
        expect(authorization.searchParams.get("redirect_uri")).toBe(
          `https://${f.apiHost("radar")}/connections/recording/callback`
        );
        const callback = await f.visit(
          f.apiHost("radar"),
          `/connections/recording/callback?state=${authorization.searchParams.get("state")}&code=accepted`,
          { cookie: canonicalCookie }
        );
        expect(callback.headers.get("location")).toBe(
          "https://radar.example.test/?connect_success=true&provider=recording"
        );
      } finally {
        await f.close();
      }
    }
  );

  it.each([
    " //radar.example.test/settings",
    "\u0000//radar.example.test/settings",
    "/\t/radar.example.test/settings",
  ])("rejects a WHATWG-normalized protocol-relative return %j", async (destination) => {
    const f = await fixture();
    try {
      const cookie = await f.login("radar");
      const response = await f.visit(
        "radar.example.test",
        `/connections/recording/start?redirect=${encodeURIComponent(destination)}`,
        { cookie }
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
    } finally {
      await f.close();
    }
  });

  it("retains legitimate encoded query spaces in a bound local return", async () => {
    const f = await fixture();
    try {
      const cookie = await f.login("radar");
      const start = await f.visit(
        "radar.example.test",
        `/connections/recording/start?redirect=${encodeURIComponent("/settings?q=a%20b")}`,
        { cookie }
      );
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      const callback = await f.visit(
        "radar.example.test",
        `/connections/recording/callback?state=${state}&error=access_denied`,
        { cookie }
      );
      expect(callback.status).toBe(302);
      const destination = new URL(String(callback.headers.get("location")));
      expect(destination.origin).toBe("https://radar.example.test");
      expect(destination.pathname).toBe("/settings");
      expect(destination.searchParams.get("q")).toBe("a b");
    } finally {
      await f.close();
    }
  });

  it("keeps neutral shared-API list and internal refresh independent of browser Experience", async () => {
    const f = await fixture({ topology: "shared" });
    try {
      const cookie = await f.login("radar");
      const start = await f.visit("api.example.test", "/connections/recording/start", {
        cookie,
        origin: "https://radar.example.test",
      });
      const state = new URL(String(start.headers.get("location"))).searchParams.get("state");
      expect(
        (
          await f.visit(
            "api.example.test",
            `/connections/recording/callback?state=${state}&code=accepted`,
            { cookie }
          )
        ).status
      ).toBe(302);
      const listed = await readConnectTRPC(
        await f.visit("api.example.test", connectListPath, { cookie })
      );
      const id = listed.result.data[0].id;
      const refreshed = await f.built.modules.connect.services.connect.refreshToken(id);
      expect(refreshed.isOk()).toBe(true);
      expect(f.exchanges.at(-1)?.get("grant_type")).toBe("refresh_token");
      expect(f.exchanges.at(-1)?.get("redirect_uri")).toBeNull();
      expect(
        (
          await f.visit("api.example.test", "/trpc/connect.delete", {
            cookie,
            method: "POST",
            body: { id },
          })
        ).status
      ).toBe(200);
    } finally {
      await f.close();
    }
  });

  it("does not let an earlier flow cleanup timer invalidate a newer flow", async () => {
    const f = await fixture();
    const originalTimer = globalThis.setTimeout;
    const cleanup: Array<() => void> = [];
    const timer = jest
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((handler, delay, ...args) => {
        if (delay === 600000 && typeof handler === "function") cleanup.push(() => handler(...args));
        return originalTimer(handler, delay, ...args);
      });
    const initial = Date.now();
    const time = jest.spyOn(Date, "now").mockReturnValue(initial);
    try {
      const cookie = await f.login("radar");
      const first = await f.visit("radar.example.test", "/connections/recording/start", { cookie });
      const oldState = new URL(String(first.headers.get("location"))).searchParams.get("state");
      time.mockReturnValue(initial + 9 * 60 * 1000);
      const newer = await f.visit("radar.example.test", "/connections/recording/start", { cookie });
      const newState = new URL(String(newer.headers.get("location"))).searchParams.get("state");
      expect(cleanup).toHaveLength(2);
      time.mockReturnValue(initial + 10 * 60 * 1000 + 1);
      cleanup[0]();
      const response = await f.visit(
        "radar.example.test",
        `/connections/recording/callback?state=${newState}&code=accepted`,
        { cookie }
      );
      expect(response.status).toBe(302);
      const expired = await f.visit(
        "radar.example.test",
        `/connections/recording/callback?state=${oldState}&code=accepted`,
        { cookie }
      );
      expect(expired.status).toBe(400);
      expect(f.exchanges).toHaveLength(1);
    } finally {
      timer.mockRestore();
      time.mockRestore();
      await f.close();
    }
  });
  it.each(["/", "/connections/"])(
    "keeps the canonical API origin for mountPath %j",
    async (mountPath) => {
      const f = await fixture({ mountPath });
      try {
        const cookie = await f.login("horeka");
        const prefix = mountPath.replace(/\/+$/, "");
        const start = await f.visit("horeka.example.test", `${prefix}/recording/start`, { cookie });
        expect(start.status).toBe(302);
        const authorization = new URL(String(start.headers.get("location")));
        expect(authorization.searchParams.get("redirect_uri")).toBe(
          `https://horeka.example.test${prefix}/recording/callback`
        );
        const callback = await f.visit(
          "horeka.example.test",
          `${prefix}/recording/callback?state=${authorization.searchParams.get("state")}&code=accepted`,
          { cookie }
        );
        expect(callback.status).toBe(302);
        expect(f.exchanges[0]?.get("redirect_uri")).toBe(
          `https://horeka.example.test${prefix}/recording/callback`
        );
      } finally {
        await f.close();
      }
    }
  );
  it("preserves stateful class-based provider adapters when normalizing immutable callback configuration", async () => {
    const f = await fixture();
    class RecordingProvider {
      get id() {
        return "recording";
      }
      clientId = "class-client";
      clientSecret = "class-secret";
      scopes = ["read"];
      issuerConfig = {
        issuer: "https://provider.example.test",
        authorization_endpoint: "https://provider.example.test/authorize",
        token_endpoint: "https://provider.example.test/token",
      };
      mapped = 0;
      async mapProfile() {
        this.mapped += 1;
        return {
          providerAccountId: "class-person",
          displayName: "Class Provider Person",
          accountType: "user" as const,
        };
      }
    }
    const adapter = new RecordingProvider();
    try {
      const service = new ConnectService(
        { connect: f.built.modules.connect.repositories.connect },
        [adapter],
        defaultConnectGrants,
        {
          registry: f.built.config.app.experienceRegistry,
          mountPath: "/class",
        }
      );
      f.built.express.app.use("/class", createConnectRouter(f.built.auth!.middleware, service));
      const cookie = await f.login("radar");
      const start = await f.visit("radar.example.test", "/class/recording/start", { cookie });
      const authorization = new URL(String(start.headers.get("location")));
      expect(authorization.searchParams.get("redirect_uri")).toBe(
        "https://radar.example.test/class/recording/callback"
      );
      const callback = await f.visit(
        "radar.example.test",
        `/class/recording/callback?state=${authorization.searchParams.get("state")}&code=accepted`,
        { cookie }
      );
      expect(callback.headers.get("location")).toBe(
        "https://radar.example.test/?connect_success=true&provider=recording"
      );
      expect(adapter.mapped).toBe(1);
      const listed = await readConnectTRPC(
        await f.visit("radar.example.test", connectListPath, { cookie })
      );
      expect(listed.result.data).toEqual([
        expect.objectContaining({
          providerAccountId: "class-person",
          displayName: "Class Provider Person",
        }),
      ]);
    } finally {
      await f.close();
    }
  });
});

describe("Connection JSON browser start", () => {
  it("returns private JSON for a shared API Origin and retains canonical/session-bound callback", async () => {
    const f = await fixture({ topology: "shared" });
    try {
      const cookie = await f.login("horeka");
      const response = await f.visit("api.example.test", "/connections/recording/start", {
        method: "POST",
        cookie,
        origin: "https://horeka.example.test",
        body: { redirect: "/settings?tab=connections" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("location")).toBeNull();
      const started = await response.json();
      const authorization = new URL(started.url);
      expect(authorization.origin).toBe("https://provider.example.test");
      const callback = await f.visit(
        "api.example.test",
        `/connections/recording/callback?state=${authorization.searchParams.get("state")}&code=accepted`,
        { cookie }
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(
        "https://horeka.example.test/settings?tab=connections&connect_success=true&provider=recording"
      );
      for (const body of [
        { redirect: "//horeka.example.test/settings" },
        { redirect: "/settings", state: "caller-selected" },
      ]) {
        const invalid = await f.visit("api.example.test", "/connections/recording/start", {
          method: "POST",
          cookie,
          origin: "https://horeka.example.test",
          body,
        });
        expect(invalid.status).toBe(400);
      }
      const alias = await f.visit("alias-radar.example.test", "/connections/recording/start", {
        method: "POST",
        cookie,
        body: { redirect: "/settings" },
      });
      expect(alias.status).toBe(400);
    } finally {
      await f.close();
    }
  });
});

describe("Named Connection browser operations", () => {
  it("identifies missing presentation and invalid callback state without provider effects", async () => {
    const f = await fixture();
    try {
      const neutral = new ConnectService(
        f.built.modules.connect.repositories,
        [],
        defaultConnectGrants
      );
      const missing = await neutral.startAuth(
        { provider: "recording" },
        { user: { id: "person" }, sessionId: "missing-session" }
      );
      expect(missing.isErr()).toBe(true);
      if (missing.isErr()) expect(missing.error.context).toMatchObject({ procedure: "startAuth" });
      const service: ConnectService = f.built.modules.connect.services.connect;
      const invalid = await service.handleCallback(
        { provider: "recording", state: "invalid" },
        { user: { id: "person" }, sessionId: "missing-session" }
      );
      expect(invalid.isErr()).toBe(true);
      if (invalid.isErr()) {
        expect(invalid.error.code).toBe("BAD_REQUEST");
        expect(invalid.error.context).toMatchObject({ procedure: "handleCallback" });
      }
      expect(f.exchanges).toEqual([]);
    } finally {
      await f.close();
    }
  });
});

describe("Registered Connection callback query", () => {
  it.each(["state", "code", "error", "error_description", "redirect", "provider"])(
    "rejects reserved callback field %s at boot",
    async (key) => {
      const pool = createTestPool();
      let shutdown: (() => Promise<void>) | undefined;
      try {
        expect(() => {
          const built = createBackendApp(
            {
              db: { client: pool },
              schema,
              app: {
                urls: { web: "https://radar.example.test", api: "https://radar.example.test" },
              },
            },
            [
              new ConnectModule([
                createGoogleProvider({
                  clientId: "client",
                  clientSecret: "secret",
                  redirectUri: `https://radar.example.test/connect/google/callback?${key}=registered`,
                }),
              ]),
            ]
          );
          shutdown = built.shutdown;
        }).toThrow("Connection callback query contains a reserved flow field");
      } finally {
        await shutdown?.();
        await pool.end();
      }
    }
  );
});

describe("Local Connection presentation boot contract", () => {
  it("requires a web origin for configured OAuth providers while preserving API-only neutral Kernel and empty Connect", async () => {
    const pool = createTestPool();
    const previous = process.env.VITE_APP_URL;
    delete process.env.VITE_APP_URL;
    const shutdowns: (() => Promise<void>)[] = [];
    try {
      const config = {
        db: { client: pool },
        schema,
        app: { urls: { api: "http://localhost:8080" } },
      };
      const neutral = createBackendApp(config);
      shutdowns.push(neutral.shutdown);
      expect(neutral.config.app.experienceRegistry).toBeUndefined();
      const empty = createBackendApp(config, [new ConnectModule([])]);
      shutdowns.push(empty.shutdown);
      expect(empty.modules.connect.services.connect.getProvider("google")).toBeNull();
      expect(() => {
        const built = createBackendApp(config, [
          new ConnectModule([
            createGoogleProvider({
              clientId: "client",
              clientSecret: "secret",
              redirectUri: "http://localhost:8080/connect/google/callback",
            }),
          ]),
        ]);
        shutdowns.push(built.shutdown);
      }).toThrow(
        "Configured Connection OAuth providers require app.urls.web / VITE_APP_URL and app.urls.api / VITE_SERVER_URL"
      );
    } finally {
      for (const shutdown of shutdowns) await shutdown();
      if (previous === undefined) delete process.env.VITE_APP_URL;
      else process.env.VITE_APP_URL = previous;
      await pool.end();
    }
  });
});
