import { fileURLToPath } from "node:url";
import "dotenv/config";

import { getOrchestratorConfig } from "./config";

type EnvInput = Record<string, string | undefined>;

export const startOrchestrator = (env: EnvInput = process.env): void => {
  const config = getOrchestratorConfig(env);

  process.stdout.write(
    `[agent-orchestrator] initialized (analyze=${config.flags.analyze}, casting=${config.flags.casting}, run=${config.flags.run}, model=${config.model})\n`
  );
};

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  try {
    startOrchestrator();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown startup failure";
    process.stderr.write(`[agent-orchestrator] failed to start: ${message}\n`);
    process.exit(1);
  }
}
