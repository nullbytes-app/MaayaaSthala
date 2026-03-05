import { describe, expect, it } from "vitest";

import {
  createExpressionState,
  addExpression,
  setTargetExpression,
  setGazeTarget
} from "../web/expressionEngine.js";

/** Minimal stub that satisfies canvas/image duck-typing. */
const fakeCanvas = (w = 100, h = 150) => ({ width: w, height: h });

describe("expression engine — crossfade race fix", () => {
  it("initializes desiredKey to 'neutral'", () => {
    const state = createExpressionState("fox");
    expect(state.desiredKey).toBe("neutral");
  });

  it("stores desiredKey even when image is unavailable", () => {
    const state = createExpressionState("fox");
    state.expressions.set("neutral", fakeCanvas());
    // No "happy" image loaded yet.
    setTargetExpression(state, "happy");

    expect(state.desiredKey).toBe("happy");
    // Should resolve to neutral since happy image doesn't exist.
    expect(state.targetKey).toBe("neutral");
  });

  it("triggers deferred crossfade when desired image arrives late", () => {
    const state = createExpressionState("fox");
    state.expressions.set("neutral", fakeCanvas());

    // 1. EMOTE arrives before image — intent stored but resolves to neutral.
    setTargetExpression(state, "happy");
    expect(state.desiredKey).toBe("happy");
    expect(state.targetKey).toBe("neutral");

    // 2. Image arrives later — addExpression should trigger crossfade.
    addExpression(state, "happy", fakeCanvas());
    expect(state.targetKey).toBe("happy");
    expect(state.crossfadeProgress).toBe(0);
    expect(state.emotionPop).toBe(1.0);
  });

  it("does not trigger crossfade for undesired key", () => {
    const state = createExpressionState("fox");
    state.expressions.set("neutral", fakeCanvas());

    setTargetExpression(state, "happy");

    // "angry" image arrives but desiredKey is "happy" — no crossfade.
    addExpression(state, "angry", fakeCanvas());
    expect(state.targetKey).toBe("neutral"); // unchanged
  });

  it("resolves directly when image is already available", () => {
    const state = createExpressionState("fox");
    state.expressions.set("neutral", fakeCanvas());
    state.expressions.set("happy", fakeCanvas());

    setTargetExpression(state, "happy");

    expect(state.desiredKey).toBe("happy");
    expect(state.targetKey).toBe("happy");
    expect(state.crossfadeProgress).toBe(0);
  });
});

describe("expression engine — gaze tracking", () => {
  it("sets gazeTargetX", () => {
    const state = createExpressionState("fox");
    expect(state.gazeTargetX).toBe(0);

    setGazeTarget(state, 360);
    expect(state.gazeTargetX).toBe(360);
  });

  it("initializes gazeOffsetX to 0", () => {
    const state = createExpressionState("fox");
    expect(state.gazeOffsetX).toBe(0);
  });
});

describe("expression engine — emotion tilt", () => {
  it("sets tilt on happy expression change", () => {
    const state = createExpressionState("fox");
    state.expressions.set("neutral", fakeCanvas());
    state.expressions.set("happy", fakeCanvas());

    setTargetExpression(state, "happy");
    expect(state.emotionTilt).toBe(0.02);
    expect(state.emotionTiltOffsetY).toBe(0);
  });

  it("sets tilt and offsetY on sad expression change", () => {
    const state = createExpressionState("fox");
    state.expressions.set("neutral", fakeCanvas());
    state.expressions.set("sad", fakeCanvas());

    setTargetExpression(state, "sad");
    expect(state.emotionTilt).toBe(-0.01);
    expect(state.emotionTiltOffsetY).toBe(2);
  });

  it("initializes hairOffset to 0", () => {
    const state = createExpressionState("fox");
    expect(state.hairOffset).toBe(0);
  });
});
