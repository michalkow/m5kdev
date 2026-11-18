import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";
import express, { type Express } from "express";
import { TestHarnessModule } from "./test-harness.module";

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

function mountHarness(app: Express): void {
  const harness = new TestHarnessModule();
  harness.express({
    db: { orm: {}, schema: {} },
    infra: { express: app },
  } as never);
}

describe("TestHarnessModule HTTP", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("does not mount unauthenticated e2e routes in production", async () => {
    process.env.NODE_ENV = "production";
    const app = express();
    mountHarness(app);

    await withServer(app, async (baseUrl) => {
      const lookup = await fetch(`${baseUrl}/__auth-e2e/user.json?email=person@example.com`);
      assert.equal(lookup.status, 404);

      const provision = await fetch(`${baseUrl}/__auth-e2e/provisioned-claim-user`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@provisioned.auth-e2e.local" }),
      });
      assert.equal(provision.status, 404);

      const organizations = await fetch(`${baseUrl}/__auth-e2e/organizations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count: 1, prefix: "Harness" }),
      });
      assert.equal(organizations.status, 404);
    });
  });

  it("mounts e2e lookup outside production and rejects a missing email", async () => {
    const app = express();
    mountHarness(app);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/__auth-e2e/user.json`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "email is required" });
    });
  });
});
