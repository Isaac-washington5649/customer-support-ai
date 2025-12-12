import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter, OTLPMetricExporter } from "@opentelemetry/exporter-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { env } from "./env";
import { logger } from "./logging";

let sdk: NodeSDK | null = null;

export async function startTelemetry() {
  if (sdk) return sdk;

  const baseUrl = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, "");

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: env.OTEL_SERVICE_NAME,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({ url: `${baseUrl}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${baseUrl}/v1/metrics` }),
      exportIntervalMillis: 15000,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
  logger.info("Telemetry initialized", { endpoint: baseUrl });
  return sdk;
}

export async function shutdownTelemetry() {
  if (!sdk) return;
  await sdk.shutdown();
  logger.info("Telemetry shut down");
  sdk = null;
}
