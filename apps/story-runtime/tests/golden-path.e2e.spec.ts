import { describe, expect, it } from "vitest";

import { playScene } from "../src/runtime";

describe("golden path scene", () => {
  it("plays invocation -> temptation peak -> restoration", async () => {
    const report = await playScene("goldenPath");
    expect(report.hasTemptationPeak).toBe(true);
    expect(report.endsWithRestoration).toBe(true);
  });

  it("throws for unknown scenes", async () => {
    await expect(playScene("unknownScene")).rejects.toThrow("Unknown scene: unknownScene");
  });

  it("throws when cast is unresolved", async () => {
    await expect(
      playScene("brokenCast", {
        brokenCast: {
          sceneId: "brokenCast",
          cast: [
            {
              charId: "hero",
              resolvedArtifactId: ""
            }
          ],
          commands: []
        }
      })
    ).rejects.toThrow("Scene cast is not fully resolved: brokenCast");
  });

  it("does not mark temptation peak when it happens before invocation", async () => {
    const report = await playScene("outOfOrder", {
      outOfOrder: {
        sceneId: "outOfOrder",
        cast: [
          {
            charId: "hero",
            resolvedArtifactId: "hero_raju_v2"
          },
          {
            charId: "shadowDouble",
            resolvedArtifactId: "shadow_double_v1"
          }
        ],
        commands: [
          {
            beat: 0,
            lane: "narration",
            opcode: "NARRATE",
            payload: {
              storyState: "temptation_peak",
              shadowDouble: true,
              desireDelta: 70,
              oathDelta: -35
            }
          },
          {
            beat: 1,
            lane: "narration",
            opcode: "NARRATE",
            payload: {
              storyState: "invocation",
              oathDelta: 5
            }
          },
          {
            beat: 2,
            lane: "narration",
            opcode: "NARRATE",
            payload: {
              storyState: "restoration"
            }
          }
        ]
      }
    });

    expect(report.hasTemptationPeak).toBe(false);
    expect(report.endsWithRestoration).toBe(true);
  });

  it("orders commands by beat before evaluating final state", async () => {
    const report = await playScene("beatOrder", {
      beatOrder: {
        sceneId: "beatOrder",
        cast: [
          {
            charId: "hero",
            resolvedArtifactId: "hero_raju_v2"
          },
          {
            charId: "shadowDouble",
            resolvedArtifactId: "shadow_double_v1"
          }
        ],
        commands: [
          {
            beat: 2,
            lane: "narration",
            opcode: "NARRATE",
            payload: {
              storyState: "restoration"
            }
          },
          {
            beat: 0,
            lane: "narration",
            opcode: "NARRATE",
            payload: {
              storyState: "invocation"
            }
          },
          {
            beat: 1,
            lane: "narration",
            opcode: "NARRATE",
            payload: {
              storyState: "temptation_peak",
              shadowDouble: true,
              desireDelta: 70,
              oathDelta: -35
            }
          }
        ]
      }
    });

    expect(report.hasTemptationPeak).toBe(true);
    expect(report.endsWithRestoration).toBe(true);
  });
});
