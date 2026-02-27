export type OrchestratorConfig = {
  flags: {
    analyze: boolean;
    casting: boolean;
    run: boolean;
  };
  model: string;
};

type EnvInput = Record<string, string | undefined>;

const parseBoolean = (
  envVarName: string,
  value: string | undefined,
  fallback: boolean
): boolean => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "") {
    return fallback;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(
    `Invalid boolean value for ${envVarName}: ${value}. Expected \"true\" or \"false\".`
  );
};

export const getOrchestratorConfig = (
  env: EnvInput = process.env
): OrchestratorConfig => ({
  flags: {
    analyze: parseBoolean(
      "AGENTIC_ANALYZE_ENABLED",
      env.AGENTIC_ANALYZE_ENABLED,
      false
    ),
    casting: parseBoolean(
      "AGENTIC_CASTING_ENABLED",
      env.AGENTIC_CASTING_ENABLED,
      false
    ),
    run: parseBoolean("AGENTIC_RUN_ENABLED", env.AGENTIC_RUN_ENABLED, false)
  },
  model: env.AGENTIC_MODEL?.trim() || "gemini-2.5-flash"
});
