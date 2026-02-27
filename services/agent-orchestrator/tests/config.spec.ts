import { describe, expect, it } from "vitest";

import { getOrchestratorConfig } from "../src/config";

describe("orchestrator config", () => {
  it("parses feature flags and model defaults", () => {
    const config = getOrchestratorConfig({
      AGENTIC_ANALYZE_ENABLED: "true",
      AGENTIC_CASTING_ENABLED: "false",
      AGENTIC_RUN_ENABLED: "true",
      AGENTIC_MODEL: "gemini-2.5-flash"
    });

    expect(config.flags.analyze).toBe(true);
    expect(config.flags.casting).toBe(false);
    expect(config.flags.run).toBe(true);
    expect(config.model).toBe("gemini-2.5-flash");
  });

  it("uses default model when AGENTIC_MODEL is missing", () => {
    const config = getOrchestratorConfig({
      AGENTIC_ANALYZE_ENABLED: "true",
      AGENTIC_CASTING_ENABLED: "false",
      AGENTIC_RUN_ENABLED: "true"
    });

    expect(config.model).toBe("gemini-2.5-flash");
  });

  it("uses false defaults when feature flags are missing", () => {
    const config = getOrchestratorConfig({});

    expect(config.flags.analyze).toBe(false);
    expect(config.flags.casting).toBe(false);
    expect(config.flags.run).toBe(false);
  });

  it("throws when a feature flag has an invalid boolean value", () => {
    expect(() =>
      getOrchestratorConfig({
        AGENTIC_ANALYZE_ENABLED: "ture"
      })
    ).toThrowError(/AGENTIC_ANALYZE_ENABLED/);
  });
});
