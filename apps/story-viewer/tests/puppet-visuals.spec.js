import { describe, expect, it } from "vitest";

import {
  createLeatherTextureRecipe,
  createPuppetPose,
  createPuppetPalette,
  createStageLook,
  detectPuppetRole
} from "../web/puppetVisuals.js";

describe("puppet visuals", () => {
  it("classifies artifact IDs into puppet roles", () => {
    expect(detectPuppetRole("elder_tara_gen_v1")).toBe("mentor");
    expect(detectPuppetRole("shadow_nox_gen_v1")).toBe("shadow");
    expect(detectPuppetRole("hero_raju_v2")).toBe("hero");
    expect(detectPuppetRole("villager_extra_v1")).toBe("supporting");
  });

  it("returns deterministic palette for same artifact", () => {
    const first = createPuppetPalette("asha_gen_v1");
    const second = createPuppetPalette("asha_gen_v1");

    expect(first).toEqual(second);
    expect(first.role).toBe("hero");
    expect(first.leatherFill).toMatch(/^#/);
  });

  it("builds leather stage look with glow and grain accents", () => {
    const stage = createStageLook("leather-shadow");

    expect(stage.top).toBe("#2b130b");
    expect(stage.bottom).toBe("#1d0b06");
    expect(stage.lampGlow).toBe("#f6c06f");
    expect(stage.grain).toBe("rgba(255, 230, 180, 0.06)");
  });

  it("builds deterministic motion pose for the same frame input", () => {
    const left = createPuppetPose({
      role: "hero",
      opcode: "NARRATE",
      beat: 3,
      payload: {
        storyState: "invocation"
      },
      direction: 1
    });
    const right = createPuppetPose({
      role: "hero",
      opcode: "NARRATE",
      beat: 3,
      payload: {
        storyState: "invocation"
      },
      direction: 1
    });

    expect(left).toEqual(right);
  });

  it("raises energy for BARGE_IN compared to NARRATE", () => {
    const narrate = createPuppetPose({ role: "hero", opcode: "NARRATE", beat: 1, payload: {}, direction: 1 });
    const bargeIn = createPuppetPose({ role: "hero", opcode: "BARGE_IN", beat: 1, payload: {}, direction: 1 });

    expect(bargeIn.torsoLift).toBeGreaterThan(narrate.torsoLift);
    expect(Math.abs(bargeIn.leftShoulderDeg)).toBeGreaterThan(Math.abs(narrate.leftShoulderDeg));
    expect(Math.abs(bargeIn.rightShoulderDeg)).toBeGreaterThan(Math.abs(narrate.rightShoulderDeg));
  });

  it("honors gesture hand intent in pose output", () => {
    const rightGesture = createPuppetPose({
      role: "hero",
      opcode: "GESTURE",
      beat: 2,
      payload: { hand: "right", intent: "refuse" },
      direction: 1
    });

    expect(rightGesture.rightShoulderDeg).toBeLessThan(rightGesture.leftShoulderDeg);
    expect(rightGesture.torsoLift).toBeGreaterThanOrEqual(4);
  });

  it("keeps shadow puppets more hunched than heroes", () => {
    const heroPose = createPuppetPose({ role: "hero", opcode: "NARRATE", beat: 0, payload: {}, direction: 1 });
    const shadowPose = createPuppetPose({
      role: "shadow",
      opcode: "NARRATE",
      beat: 0,
      payload: {},
      direction: 1
    });

    expect(shadowPose.torsoTiltDeg).toBeLessThan(heroPose.torsoTiltDeg);
  });

  it("returns deterministic leather texture recipe per artifact", () => {
    const first = createLeatherTextureRecipe("raju_gen_v1");
    const second = createLeatherTextureRecipe("raju_gen_v1");

    expect(first).toEqual(second);
    expect(first.seed).toBeGreaterThanOrEqual(0);
    expect(first.stitchSpacing).toBeGreaterThan(4);
  });

  it("gives shadow recipes lower warm highlights than hero recipes", () => {
    const heroRecipe = createLeatherTextureRecipe("hero_raju_v2");
    const shadowRecipe = createLeatherTextureRecipe("shadow_nox_gen_v1");

    expect(shadowRecipe.highlightAlpha).toBeLessThan(heroRecipe.highlightAlpha);
    expect(shadowRecipe.crackAlpha).toBeGreaterThan(0);
  });
});
