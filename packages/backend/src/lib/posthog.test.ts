import { gunzipSync } from "node:zlib";
import { captureServerError, ServerError } from "../utils/errors";
import { runWithPosthogRequestState } from "../utils/posthog";
import { runWithActorTelemetry } from "../utils/telemetry";
import { initPosthog, shutdownPosthog } from "./posthog";

describe("PostHog backend error delivery", () => {
  const batches: Array<{
    batch?: Array<{
      uuid?: string;
      event: string;
      distinct_id?: string;
      properties: Record<string, unknown>;
    }>;
  }> = [];

  beforeEach(() => {
    batches.length = 0;
    jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      let body = Buffer.from(options?.body as string | Uint8Array);
      if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
      batches.push(JSON.parse(body.toString()));
      return new Response("{}", { status: 200 });
    });
  });
  afterEach(async () => {
    await shutdownPosthog();
    jest.restoreAllMocks();
  });

  it("delivers a correlated exception once even when analytics capture is suppressed", async () => {
    initPosthog({ apiKey: "phc_test", host: "https://posthog.test" });
    const error = new ServerError({
      code: "INTERNAL_SERVER_ERROR",
      layer: "service",
      layerName: "Checkout",
      cause: new Error("payment provider unavailable"),
      context: { orderId: "order-1" },
    });
    runWithActorTelemetry({ userId: "user-1", organizationId: "org-1" }, () => {
      runWithPosthogRequestState({ disableCapture: true }, () => {
        const logger = { error() {}, warn() {}, debug() {} };
        captureServerError(error, { logger });
        captureServerError(error, { logger });
      });
    });
    await shutdownPosthog();
    const exceptions = batches
      .flatMap((batch) => batch.batch ?? [])
      .filter((event) => event.event === "$exception");
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({
      uuid: expect.any(String),
      distinct_id: "user-1",
      properties: { "organization.id": "org-1", layer: "service", context: { orderId: "order-1" } },
    });
    expect(error.toJSON()).toHaveProperty("errorEventId", exceptions[0]?.uuid);
    expect(JSON.stringify(exceptions[0]?.properties.$exception_list)).toContain(
      "payment provider unavailable"
    );
  });
  it("keeps expected 4xx failures out of PostHog", async () => {
    initPosthog({ apiKey: "phc_test", host: "https://posthog.test" });
    captureServerError(new ServerError({ code: "FORBIDDEN" }), {
      logger: { error() {}, warn() {}, debug() {} },
    });
    await shutdownPosthog();
    expect(
      batches.flatMap((batch) => batch.batch ?? []).filter((event) => event.event === "$exception")
    ).toEqual([]);
  });

  it.each([undefined, "", "demo"])(
    "does not initialize or send without a configured key (%s)",
    async (apiKey) => {
      expect(initPosthog({ apiKey, host: "https://posthog.test" })).toBeUndefined();
      captureServerError(new ServerError({ code: "INTERNAL_SERVER_ERROR" }), {
        logger: { error() {}, warn() {}, debug() {} },
      });
      await shutdownPosthog();
      expect(batches).toEqual([]);
    }
  );
});
