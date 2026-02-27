import { describe, expect, it, vi } from "vitest";

import { createLiveAdapter, parseWsFrame } from "../web/liveAdapter.js";

describe("live adapter", () => {
  it("parses websocket NDJSON frames into stage commands", () => {
    const out = parseWsFrame(
      '{"eventId":"evt_1","beat":0,"lane":"narration","opcode":"NARRATE","target":{"artifactId":"hero"},"payload":{}}\n'
    );

    expect(out?.eventId).toBe("evt_1");
  });

  it("returns null for malformed frames", () => {
    expect(parseWsFrame("not-json\n")).toBeNull();
    expect(parseWsFrame("\n\n")).toBeNull();
    expect(parseWsFrame('{"eventId":"evt_1"}\n')).toBeNull();
  });

  it("streams commands in sequence using playFromCommands", () => {
    vi.useFakeTimers();

    const adapter = createLiveAdapter();
    const seen = [];
    const onDone = vi.fn();
    adapter.playFromCommands(
      [
        { eventId: "evt_1", beat: 0, opcode: "SCENE_OPEN" },
        { eventId: "evt_2", beat: 1, opcode: "NARRATE" }
      ],
      (command) => {
        seen.push(command.eventId);
      },
      onDone,
      100
    );

    vi.advanceTimersByTime(350);
    expect(seen).toEqual(["evt_1", "evt_2"]);
    expect(onDone).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(300);
    expect(seen).toEqual(["evt_1", "evt_2"]);
    expect(onDone).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
