import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Response } from "express";
import express from "express";
import { err, ok } from "neverthrow";
import { ServerError } from "../../../utils/errors";
import type { Session, User } from "../../auth/auth.lib";
import type { AuthMiddleware, AuthRequest } from "../../auth/auth.middleware";
import { createConnectRouter } from "../connect.router";
import type { ConnectService } from "../connect.service";

const APP_URL = "https://app.example.test";

async function withServer(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
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

function acceptAuth(): AuthMiddleware {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: "user-1", role: "user" } as User;
    req.session = { id: "sess-1" } as Session;
    next();
  };
}

function mountApp(connect: Pick<ConnectService, "startAuth" | "handleCallback">): express.Express {
  const app = express();
  app.use("/connect", createConnectRouter(acceptAuth(), connect as ConnectService));
  return app;
}

function failingStart(): Pick<ConnectService, "startAuth" | "handleCallback"> {
  return {
    startAuth: async () =>
      err(new ServerError({ code: "BAD_REQUEST", message: "Unknown provider: google" })),
    handleCallback: async () => ok({ id: "conn-1" }),
  };
}

describe("Connection HTTP query params", () => {
  const previousAppUrl = process.env.VITE_APP_URL;

  beforeEach(() => {
    process.env.VITE_APP_URL = APP_URL;
  });

  afterEach(() => {
    if (previousAppUrl === undefined) {
      delete process.env.VITE_APP_URL;
    } else {
      process.env.VITE_APP_URL = previousAppUrl;
    }
  });

  it("uses the app URL when start redirect is repeated (not a string)", async () => {
    await withServer(mountApp(failingStart()), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/connect/google/start?redirect=https://one.example/ok&redirect=https://two.example/ok`,
        { redirect: "manual" }
      );
      expect(response.status).toBe(302);
      const location = response.headers.get("location");
      expect(location).toBe(
        `${APP_URL}?connect_error=${encodeURIComponent("Unknown provider: google")}`
      );
    });
  });

  it("uses a string start redirect when startAuth fails", async () => {
    await withServer(mountApp(failingStart()), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/connect/google/start?redirect=${encodeURIComponent("https://app.example.test/return")}`,
        { redirect: "manual" }
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://app.example.test/return?error=${encodeURIComponent("Unknown provider: google")}`
      );
    });
  });

  it("treats a repeated callback code as missing", async () => {
    await withServer(mountApp(failingStart()), async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/connect/google/callback?code=aaa&code=bbb&state=state-1`,
        { redirect: "manual" }
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `${APP_URL}?connect_success=true&error=${encodeURIComponent("Missing code or state")}`
      );
    });
  });
});
