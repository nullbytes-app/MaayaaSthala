import "dotenv/config";
import { fileURLToPath } from "node:url";

import { createResolverHttpServer } from "./httpServer";
import type { TraceEvent } from "../../agent-orchestrator/src/telemetry/traceLogger";

type EnvInput = Record<string, string | undefined>;

type ResolverServerConfig = {
  port: number;
  maxBodyBytes: number;
};

const parsePositiveInteger = (
  rawValue: string | undefined,
  defaultValue: number,
  name: "PORT" | "MAX_BODY_BYTES"
): number => {
  if (rawValue === undefined || rawValue.trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
};

export const getResolverServerConfig = (env: EnvInput): ResolverServerConfig => ({
  port: parsePositiveInteger(env.PORT, 8080, "PORT"),
  maxBodyBytes: parsePositiveInteger(env.MAX_BODY_BYTES, 1024 * 1024, "MAX_BODY_BYTES")
});

export const startResolverServer = async (env: EnvInput = process.env): Promise<void> => {
  const config = getResolverServerConfig(env);
  const onTraceEvent = (event: TraceEvent): void => {
    process.stdout.write(`[resolver-trace] ${JSON.stringify(event)}\n`);
  };
  const server = await createResolverHttpServer({
    ...config,
    onTraceEvent
  });

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\n[resolver] received ${signal}, shutting down...\n`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.stdout.write(
    `[resolver] listening on http://0.0.0.0:${server.port} (maxBodyBytes=${config.maxBodyBytes})\n`
  );
};

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  startResolverServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown startup failure";
    process.stderr.write(`[resolver] failed to start: ${message}\n`);
    process.exit(1);
  });
}
