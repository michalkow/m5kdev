import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("PostHog automatic process exception delivery", () => {
  it.each([
    {
      mode: "rejection",
      exit: 0,
      mechanism: "onunhandledrejection",
      message: "detached rejection",
    },
    { mode: "exception", exit: 1, mechanism: "onuncaughtexception", message: "detached throw" },
  ])(
    "preserves Actor/trace context and native exit for $mode",
    ({ mode, exit, mechanism, message }) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "posthog-process-"));
      const output = path.join(directory, "delivery.json");
      try {
        const result = spawnSync(
          process.execPath,
          [
            "--import",
            require.resolve("tsx"),
            "--unhandled-rejections=warn",
            path.resolve(__dirname, "../test/fixtures/posthog-autocapture.cjs"),
            output,
            mode,
          ],
          { encoding: "utf8", timeout: 15000 }
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(exit);
        if (!fs.existsSync(output)) throw new Error(result.stderr + result.stdout);
        const delivery = JSON.parse(fs.readFileSync(output, "utf8"));
        expect(delivery.exceptions).toHaveLength(mode === "rejection" ? 2 : 1);
        expect(delivery.exceptions[0]).toMatchObject({
          distinct_id: "request-user",
          properties: {
            "user.id": "request-user",
            "organization.id": "request-org",
            $trace_id: delivery.spanContext.traceId,
            $span_id: delivery.spanContext.spanId,
            $exception_list: expect.arrayContaining([
              expect.objectContaining({
                value: message,
                mechanism: expect.objectContaining({ type: mechanism, handled: false }),
              }),
            ]),
          },
        });
        if (mode === "rejection") {
          expect(delivery.exceptions[1].distinct_id).not.toBe("request-user");
          expect(delivery.exceptions[1].properties).not.toHaveProperty("user.id");
          expect(delivery.exceptions[1].properties).not.toHaveProperty("organization.id");
          expect(delivery.exceptions[1].properties).not.toHaveProperty("$trace_id");
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
    20000
  );
});
