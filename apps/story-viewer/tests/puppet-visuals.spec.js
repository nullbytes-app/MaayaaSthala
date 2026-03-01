import { describe, expect, it } from "vitest";

import {
  createPuppetPalette,
  createStageLook,
  detectPuppetRole
} from "../web/puppetVisuals.js";

/**
 * Tests for the minimal puppetVisuals.js residual.
 * createPuppetPose and createLeatherTextureRecipe have been removed —
 * cinematic storybook uses expressionEngine.js for all character animation.
 */
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

  it("returns different palettes for different roles", () => {
    const hero = createPuppetPalette("hero_raju_v2");
    const shadow = createPuppetPalette("shadow_nox_gen_v1");

    expect(hero.role).toBe("hero");
    expect(shadow.role).toBe("shadow");
    expect(hero.leatherFill).not.toBe(shadow.leatherFill);
  });

  it("builds leather stage look with correct keys", () => {
    const stage = createStageLook("leather-shadow");

    // Core keys present.
    expect(stage.top).toMatch(/^#/);
    expect(stage.bottom).toMatch(/^#/);
    expect(stage.lampGlow).toBe("#f6c06f");
    expect(stage.grain).toMatch(/^rgba/);
  });

  it("builds night stage look when style is not leather-shadow", () => {
    const stage = createStageLook("night");

    expect(stage.top).toBe("#1f2233");
    expect(stage.text).toBe("#e9efff");
  });
});
