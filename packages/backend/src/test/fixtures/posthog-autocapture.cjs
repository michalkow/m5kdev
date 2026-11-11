const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");
const { trace } = require("@opentelemetry/api");
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const sourceRoot = path.resolve(__dirname, "../..");
const { initPosthog, shutdownPosthog } = require(path.join(sourceRoot, "lib/posthog.ts"));
const { runWithActorTelemetry } = require(path.join(sourceRoot, "utils/telemetry.ts"));

const output = process.argv[2];
const mode = process.argv[3];
const provider = new NodeTracerProvider();
provider.register();
let spanContext;
const exceptions = [];
function persist() {
  fs.writeFileSync(output, JSON.stringify({ spanContext, exceptions }));
}
globalThis.fetch = async (_url, options) => {
  let body = Buffer.from(options.body);
  if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
  exceptions.push(
    ...JSON.parse(body.toString()).batch.filter((event) => event.event === "$exception")
  );
  persist();
  return new Response("{}", { status: 200 });
};

async function main() {
  const client = initPosthog({ apiKey: "phc_process", host: "https://posthog.test" });
  if (mode === "after-shutdown") {
    await shutdownPosthog();
    void Promise.reject(new Error("after shutdown"));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await client.flush();
    persist();
    return;
  }
  runWithActorTelemetry({ userId: "request-user", organizationId: "request-org" }, () => {
    trace.getTracer("process-regression").startActiveSpan("detached", (span) => {
      spanContext = span.spanContext();
      if (mode === "exception") {
        setImmediate(() => {
          throw new Error("detached throw");
        });
      } else {
        void Promise.reject(new Error("detached rejection"));
      }
    });
  });
  if (mode === "exception") return;
  await new Promise((resolve) => setImmediate(resolve));
  await client.flush();
  // A later detached task outside the authenticated scope must stay anonymous.
  void Promise.reject(new Error("anonymous rejection"));
  await new Promise((resolve) => setImmediate(resolve));
  await client.flush();
  await shutdownPosthog();
  await provider.shutdown();
  persist();
}
void main();
