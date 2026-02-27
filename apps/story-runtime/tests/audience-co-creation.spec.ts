import { describe, expect, it } from "vitest";

import { playStageCommands, type RuntimeStageCommand } from "../src/runtime";

const cast = ["hero_raju_v2", "shadow_double_v1"];

const createBaseCommands = (): RuntimeStageCommand[] => [
  {
    version: "1.0",
    eventId: "evt_invocation",
    sceneId: "audience_scene",
    beat: 0,
    lane: "narration",
    opcode: "NARRATE",
    target: { artifactId: "hero_raju_v2" },
    payload: {
      storyState: "invocation",
      oathDelta: 5
    }
  },
  {
    version: "1.0",
    eventId: "evt_peak",
    sceneId: "audience_scene",
    beat: 2,
    lane: "narration",
    opcode: "NARRATE",
    target: { artifactId: "shadow_double_v1" },
    payload: {
      storyState: "temptation_peak",
      shadowDouble: true,
      oathDelta: -25,
      desireDelta: 40
    }
  },
  {
    version: "1.0",
    eventId: "evt_restore",
    sceneId: "audience_scene",
    beat: 3,
    lane: "narration",
    opcode: "NARRATE",
    target: { artifactId: "hero_raju_v2" },
    payload: {
      storyState: "restoration",
      oathDelta: 20,
      desireDelta: -30
    }
  }
];

describe("audience co-creation", () => {
  it("accepts a barge-in inside interrupt window and applies chorus influence", async () => {
    const commands = createBaseCommands();
    commands.splice(1, 0, {
      version: "1.0",
      eventId: "evt_barge_warn",
      sceneId: "audience_scene",
      beat: 1,
      lane: "control",
      opcode: "BARGE_IN",
      target: { artifactId: "hero_raju_v2" },
      payload: {
        chorusRole: "elder",
        intent: "warn",
        windowStart: 1,
        windowEnd: 2
      }
    });

    const report = await playStageCommands(commands, cast);
    expect(report.audience.accepted).toBe(1);
    expect(report.audience.rejected).toBe(0);
    expect(report.hasTemptationPeak).toBe(false);
  });

  it("rejects a barge-in outside interrupt window", async () => {
    const commands = createBaseCommands();
    commands.splice(1, 0, {
      version: "1.0",
      eventId: "evt_barge_late",
      sceneId: "audience_scene",
      beat: 3,
      lane: "control",
      opcode: "BARGE_IN",
      target: { artifactId: "hero_raju_v2" },
      payload: {
        chorusRole: "elder",
        intent: "warn",
        windowStart: 1,
        windowEnd: 2
      }
    });

    const report = await playStageCommands(commands, cast);
    expect(report.audience.accepted).toBe(0);
    expect(report.audience.rejected).toBe(1);
    expect(report.hasTemptationPeak).toBe(true);
  });
});
