import type { AddressInfo } from "node:net";
import net from "node:net";
import { type Client, createClient } from "@libsql/client";
import { createBackendApp } from "./app";

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

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

describe("createBackendApp listen", () => {
  let client: Client;
  let previousPort: string | undefined;

  beforeEach(() => {
    client = createClient({ url: ":memory:" });
    previousPort = process.env.PORT;
  });

  afterEach(async () => {
    await client.close?.();
    if (previousPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }
  });

  it("rejects start and exits when the listen port is already bound", async () => {
    const blocker = net.createServer();
    const port = await new Promise<number>((resolve, reject) => {
      blocker.listen(0, "0.0.0.0", () => {
        resolve((blocker.address() as AddressInfo).port);
      });
      blocker.on("error", reject);
    });
    process.env.PORT = String(port);
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const built = createBackendApp({ db: { client } });

    try {
      await expect(built.start()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      await new Promise<void>((resolve) => {
        blocker.close(() => resolve());
      });
      await built.shutdown().catch(() => undefined);
    }
  });

  it("runs onShutdown after HTTP close and does not exit on programmatic shutdown", async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    let sawClosedHttp = false;
    const built = createBackendApp({
      db: { client },
      onShutdown: async () => {
        await expect(fetch(`http://127.0.0.1:${port}/ping`)).rejects.toThrow();
        sawClosedHttp = true;
      },
    });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    try {
      await built.start();
      await built.shutdown();
      expect(sawClosedHttp).toBe(true);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("closes HTTP and exits on SIGINT after listening", async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    const handlers = new Map<NodeJS.Signals, () => void>();
    const originalOnce = process.once.bind(process);
    const onceSpy = jest.spyOn(process, "once").mockImplementation(((
      event: string | symbol,
      listener: (...args: unknown[]) => void
    ) => {
      if (event === "SIGINT" || event === "SIGTERM") {
        handlers.set(event, listener as () => void);
        return process;
      }
      return originalOnce(event as never, listener);
    }) as typeof process.once);
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const built = createBackendApp({ db: { client } });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    try {
      await built.start();
      const onSigint = handlers.get("SIGINT");
      expect(onSigint).toBeDefined();
      expect(handlers.get("SIGTERM")).toBeDefined();

      onSigint?.();
      for (let i = 0; i < 50 && exitSpy.mock.calls.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await expect(fetch(`http://127.0.0.1:${port}/ping`)).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      onceSpy.mockRestore();
      exitSpy.mockRestore();
      await built.shutdown().catch(() => undefined);
    }
  });

  it("throws when start({ listen: true }) is called while already listening", async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    const built = createBackendApp({ db: { client } });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await built.start();
    await expect(built.start()).rejects.toThrow();
    expect((await fetch(`http://127.0.0.1:${port}/ping`)).ok).toBe(true);
    await built.shutdown();
    await expect(fetch(`http://127.0.0.1:${port}/ping`)).rejects.toThrow();
  });

  it("stops accepting connections after shutdown", async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    const built = createBackendApp({ db: { client } });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await built.start();
    await built.shutdown();
    await expect(built.shutdown()).resolves.toBeUndefined();

    await expect(fetch(`http://127.0.0.1:${port}/ping`)).rejects.toThrow();
  });

  it("skips binding when start({ listen: false }) is used", async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    const onceSpy = jest.spyOn(process, "once");
    const built = createBackendApp({ db: { client } });

    try {
      await built.start({ listen: false });
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
      expect(onceSpy.mock.calls.some((call) => call[0] === "SIGINT" || call[0] === "SIGTERM")).toBe(
        false
      );
    } finally {
      onceSpy.mockRestore();
      await built.shutdown();
    }
  });

  it("listens on PORT so the Express app accepts TCP connections", async () => {
    const port = await getFreePort();
    process.env.PORT = String(port);
    const built = createBackendApp({ db: { client } });
    built.express.app.get("/ping", (_req, res) => {
      res.json({ ok: true });
    });

    await built.start();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ping`);
      expect(response.ok).toBe(true);
      expect(await response.json()).toEqual({ ok: true });
    } finally {
      await built.shutdown();
    }
  });
});
