import { describe, expect, it } from "vitest";

import { applyMythicCue, createMythicState } from "../src/mythicEngine";

describe("mythic engine", () => {
  it("triggers temptation when desire rises and oath drops during shadow-double cue", () => {
    let state = createMythicState();

    state = applyMythicCue(state, {
      beat: 0,
      storyState: "invocation",
      oathDelta: 5
    });

    state = applyMythicCue(state, {
      beat: 1,
      storyState: "temptation_peak",
      shadowDouble: true,
      desireDelta: 70,
      oathDelta: -40
    });

    expect(state.temptationTriggered).toBe(true);
    expect(state.shadowDoubleActive).toBe(true);
    expect(state.temptationBeats).toEqual([1]);
  });

  it("resolves shadow-double during restoration and lowers desire", () => {
    let state = createMythicState();
    state = applyMythicCue(state, {
      beat: 1,
      storyState: "temptation_peak",
      shadowDouble: true,
      desireDelta: 80,
      oathDelta: -45
    });

    state = applyMythicCue(state, {
      beat: 2,
      storyState: "restoration",
      desireDelta: -30,
      oathDelta: 20
    });

    expect(state.shadowDoubleActive).toBe(false);
    expect(state.desireLevel).toBeLessThanOrEqual(40);
  });
});
