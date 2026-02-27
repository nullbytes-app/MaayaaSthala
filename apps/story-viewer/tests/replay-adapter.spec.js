import { describe, expect, it } from "vitest";

import { buildReplayFrames } from "../web/replayAdapter.js";

describe("replay adapter", () => {
  it("orders replay events by beat and emits frame updates", () => {
    const frames = buildReplayFrames([
      {
        eventId: "evt_2",
        beat: 2,
        lane: "narration",
        opcode: "NARRATE",
        target: { artifactId: "hero" },
        payload: {}
      },
      {
        eventId: "evt_1",
        beat: 0,
        lane: "control",
        opcode: "SCENE_OPEN",
        target: { artifactId: "stage" },
        payload: {}
      }
    ]);

    expect(frames[0]?.beat).toBe(0);
    expect(frames[1]?.beat).toBe(2);
  });

  it("uses lane and eventId ordering for equal beats", () => {
    const frames = buildReplayFrames([
      {
        eventId: "evt_b",
        beat: 1,
        lane: "audio",
        opcode: "SPEAK",
        target: { artifactId: "hero" },
        payload: { text: "hello" }
      },
      {
        eventId: "evt_a",
        beat: 1,
        lane: "narration",
        opcode: "NARRATE",
        target: { artifactId: "hero" },
        payload: {}
      }
    ]);

    expect(frames[0]?.command.eventId).toBe("evt_a");
    expect(frames[1]?.command.eventId).toBe("evt_b");
  });

  it("prioritizes control lane before narration/audio at equal beat", () => {
    const frames = buildReplayFrames([
      {
        eventId: "evt_narrate",
        beat: 0,
        lane: "narration",
        opcode: "NARRATE",
        target: { artifactId: "hero" },
        payload: {}
      },
      {
        eventId: "evt_open",
        beat: 0,
        lane: "control",
        opcode: "SCENE_OPEN",
        target: { artifactId: "stage" },
        payload: {}
      }
    ]);

    expect(frames[0]?.command.eventId).toBe("evt_open");
    expect(frames[1]?.command.eventId).toBe("evt_narrate");
  });

  it("returns empty frame list for malformed replay payloads", () => {
    expect(buildReplayFrames(null)).toEqual([]);
    expect(buildReplayFrames(undefined)).toEqual([]);
    expect(buildReplayFrames({})).toEqual([]);
  });
});
