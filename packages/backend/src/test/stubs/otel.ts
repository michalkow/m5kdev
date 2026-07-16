import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export function registerTestTracerProvider(exporter: InMemorySpanExporter): NodeTracerProvider {
  trace.disable();
  const provider = new NodeTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();
  return provider;
}

export async function shutdownTestTracerProvider(
  provider: NodeTracerProvider,
  exporter: InMemorySpanExporter
): Promise<void> {
  exporter.reset();
  await provider.shutdown();
  trace.disable();
}
