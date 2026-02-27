import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as stageDirectorWorkflow from "../../agent-orchestrator/src/workflows/stageDirectorWorkflow";
import { clearSessionArtifactMaps } from "../src/domain/castingSessionStore";
import { approveCasting } from "../src/routes/approveCasting";
import { runDemo } from "../src/routes/runDemo";

const baseInput = {
  storyId: "story_demo_casting_1",
  language: "en",
  style: "leather-shadow",
  text: "Raju met Elder and faced his shadow before returning to his vow.",
  script: [
    "@0 SCENE_OPEN rasa=adbhuta tala=adi",
    "@0 NARRATE storyState=invocation oathDelta=5",
    "@1 NARRATE storyState=restoration oathDelta=20 desireDelta=-30",
    "@2 SCENE_CLOSE nextSceneId=next_scene"
  ].join("\n")
};

describe("run demo casting integration", () => {
  beforeEach(() => {
    clearSessionArtifactMaps();
  });

  afterEach(() => {
    delete process.env.AGENTIC_RUN_ENABLED;
    vi.restoreAllMocks();
  });

  it("uses provided cast selections when running demo", async () => {
    const out = await runDemo({
      ...baseInput,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_custom",
          source: "generated"
        }
      ]
    });

    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_custom")).toBe(true);
  });

  it("applies cast selections when charId omits c_ prefix", async () => {
    const out = await runDemo({
      ...baseInput,
      castSelections: [
        {
          charId: "raju",
          artifactId: "hero_raju_alias",
          source: "generated"
        }
      ]
    });

    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_alias")).toBe(true);
  });

  it("uses approved session cast selections when request omits castSelections", async () => {
    await approveCasting({
      storyId: baseInput.storyId,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_session",
          source: "existing"
        }
      ]
    });

    const out = await runDemo(baseInput);

    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_session")).toBe(true);
  });

  it("prioritizes request cast selections over approved session selections", async () => {
    await approveCasting({
      storyId: baseInput.storyId,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_session",
          source: "existing"
        }
      ]
    });

    const out = await runDemo({
      ...baseInput,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_request",
          source: "generated"
        }
      ]
    });

    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_request")).toBe(true);
    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_session")).toBe(false);
  });

  it("rejects duplicate character selections in runDemo input", async () => {
    await expect(
      runDemo({
        ...baseInput,
        castSelections: [
          {
            charId: "c_raju",
            artifactId: "hero_raju_v2",
            source: "existing"
          },
          {
            charId: "c_raju",
            artifactId: "hero_raju_custom",
            source: "generated"
          }
        ]
      })
    ).rejects.toThrow("Invalid runDemo input: castSelections contains duplicate charId: c_raju");
  });

  it("normalizes storyId before session cast lookup", async () => {
    await approveCasting({
      storyId: baseInput.storyId,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_session",
          source: "existing"
        }
      ]
    });

    const out = await runDemo({
      ...baseInput,
      storyId: ` ${baseInput.storyId} `
    });

    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_session")).toBe(true);
  });

  it("uses mentor casting selection for elder BARGE_IN role", async () => {
    const out = await runDemo({
      ...baseInput,
      script: [
        "@0 SCENE_OPEN rasa=adbhuta tala=adi",
        "@0 NARRATE storyState=invocation oathDelta=5",
        "@1 BARGE_IN chorusRole=elder intent=warn window=1-2",
        "@2 SCENE_CLOSE nextSceneId=next_scene"
      ].join("\n"),
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_custom",
          source: "generated"
        },
        {
          charId: "c_elder",
          artifactId: "elder_custom_v2",
          source: "generated"
        }
      ]
    });

    const elderBargeIn = out.replay.find((command) => command.opcode === "BARGE_IN");
    expect(elderBargeIn?.target.artifactId).toBe("elder_custom_v2");
  });

  it("uses legacy primary artifact selection when AGENTIC_RUN_ENABLED is false", async () => {
    process.env.AGENTIC_RUN_ENABLED = "false";

    const stageDirectorSpy = vi
      .spyOn(stageDirectorWorkflow, "buildStageDirectorPlan")
      .mockReturnValue({ primaryArtifactId: "hero_raju_agentic_gate" });

    const out = await runDemo({
      ...baseInput,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_legacy_gate",
          source: "generated"
        }
      ]
    });

    expect(stageDirectorSpy).not.toHaveBeenCalled();
    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_legacy_gate")).toBe(true);
    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_agentic_gate")).toBe(false);
  });

  it("uses stageDirector primary artifact selection when AGENTIC_RUN_ENABLED is true", async () => {
    process.env.AGENTIC_RUN_ENABLED = "true";

    const stageDirectorSpy = vi
      .spyOn(stageDirectorWorkflow, "buildStageDirectorPlan")
      .mockReturnValue({ primaryArtifactId: "hero_raju_agentic_gate" });

    const out = await runDemo({
      ...baseInput,
      castSelections: [
        {
          charId: "c_raju",
          artifactId: "hero_raju_legacy_gate",
          source: "generated"
        }
      ]
    });

    expect(stageDirectorSpy).toHaveBeenCalledTimes(1);
    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_agentic_gate")).toBe(true);
    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_legacy_gate")).toBe(false);
  });

  it("applies non-prefixed cast selections for both primary and elder role in agentic run mode", async () => {
    process.env.AGENTIC_RUN_ENABLED = "true";

    const out = await runDemo({
      ...baseInput,
      script: [
        "@0 SCENE_OPEN rasa=adbhuta tala=adi",
        "@0 NARRATE storyState=invocation oathDelta=5",
        "@1 BARGE_IN chorusRole=elder intent=warn window=1-2",
        "@2 NARRATE storyState=restoration oathDelta=20 desireDelta=-30",
        "@3 SCENE_CLOSE nextSceneId=next_scene"
      ].join("\n"),
      castSelections: [
        {
          charId: "raju",
          artifactId: "hero_raju_nonprefixed",
          source: "generated"
        },
        {
          charId: "elder",
          artifactId: "elder_nonprefixed",
          source: "generated"
        }
      ]
    });

    expect(out.replay.some((command) => command.target.artifactId === "hero_raju_nonprefixed")).toBe(true);
    expect(out.replay.some((command) => command.target.artifactId === "elder_nonprefixed")).toBe(true);
  });
});
