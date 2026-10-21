import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { ModuleExpressContext } from "../../../base/base.module";
import { WorkflowModule } from "../workflow.module";
import type { WorkflowService } from "../workflow.service";

jest.mock("@m5kdev/commons/utils/trpc", () => ({
  transformer: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
}));

jest.mock("better-auth/node", () => ({
  toNodeHandler: () => (): void => undefined,
  fromNodeHeaders: (headers: unknown) => headers,
}));

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

interface BoardMountOptions {
  boardPath?: string | null;
  roleAuthMiddleware?: (role: string) => (req: Request, res: Response, next: NextFunction) => void;
}

function mountWorkflowBoard(options: BoardMountOptions = {}): Express {
  const app = express();
  const workflow = new WorkflowModule({
    queues: { default: {} },
    defaultQueue: "default",
    ...(options.boardPath !== undefined ? { boardPath: options.boardPath } : {}),
  });

  const passThrough = (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };

  workflow.express({
    infra: { express: app },
    services: {
      workflow: {
        getBullMqQueues: (): ReturnType<WorkflowService["getBullMqQueues"]> => [],
      },
    },
    roleAuthMiddleware: options.roleAuthMiddleware ?? ((_role: string) => passThrough),
  } as ModuleExpressContext<{ auth: never }, { workflow: WorkflowService }>);

  return app;
}

describe("WorkflowModule Bull Board", () => {
  it("mounts the board at /admin/queues behind admin-role auth", async () => {
    const roles: string[] = [];
    const app = mountWorkflowBoard({
      roleAuthMiddleware: (role) => {
        roles.push(role);
        return (_req, _res, next) => {
          next();
        };
      },
    });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/admin/queues`);
      expect(response.status).not.toBe(404);
      expect(roles).toEqual(["admin"]);
    });
  });

  it("skips the board when boardPath is null", async () => {
    const app = mountWorkflowBoard({ boardPath: null });

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/admin/queues`);
      expect(response.status).toBe(404);
    });
  });

  it("mounts the board at a custom boardPath", async () => {
    const app = mountWorkflowBoard({ boardPath: "/ops/queues" });

    await withServer(app, async (baseUrl) => {
      const [custom, defaultPath] = await Promise.all([
        fetch(`${baseUrl}/ops/queues`),
        fetch(`${baseUrl}/admin/queues`),
      ]);
      expect(custom.status).not.toBe(404);
      expect(defaultPath.status).toBe(404);
    });
  });
});
