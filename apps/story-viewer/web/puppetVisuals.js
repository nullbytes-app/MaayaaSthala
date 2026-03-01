/**
 * puppetVisuals.js — Minimal residual from puppet theater.
 *
 * Keeps only the role/palette/stage-look utilities used by stageRenderer.js
 * for backdrop gradients and fallback color theming.
 * All puppet figure, limb, and pose generation has been removed.
 */

const ROLE_TOKENS = {
  hero: ["hero", "asha", "raju", "protagonist", "lead"],
  mentor: ["elder", "mentor", "guru", "tara", "sage"],
  shadow: ["shadow", "nox", "demon", "villain", "dark"]
};

const ROLE_PRIORITY = ["shadow", "mentor", "hero"];

const PALETTES_BY_ROLE = {
  hero: [
    { leatherFill: "#e4b266", leatherShade: "#c3873d", edge: "#5f2d13", ornament: "#f3d39b" },
    { leatherFill: "#d9a861", leatherShade: "#b47934", edge: "#5d2a10", ornament: "#f6d8a5" }
  ],
  mentor: [
    { leatherFill: "#c79b63", leatherShade: "#93673c", edge: "#3d2412", ornament: "#eed3a9" },
    { leatherFill: "#bc8f58", leatherShade: "#865a34", edge: "#38200f", ornament: "#e9c998" }
  ],
  shadow: [
    { leatherFill: "#8f5d53", leatherShade: "#5d3129", edge: "#1f0f0a", ornament: "#d8a18f" },
    { leatherFill: "#7f4d47", leatherShade: "#4c2721", edge: "#1a0c08", ornament: "#cb9485" }
  ],
  supporting: [
    { leatherFill: "#d4aa74", leatherShade: "#9f6f3f", edge: "#4d2b15", ornament: "#efcf9e" },
    { leatherFill: "#cca06a", leatherShade: "#93643a", edge: "#472812", ornament: "#edcb97" }
  ]
};

const normalizeToken = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
};

export const detectPuppetRole = (artifactId) => {
  const token = normalizeToken(String(artifactId ?? ""));
  for (const role of ROLE_PRIORITY) {
    if (ROLE_TOKENS[role].some((roleToken) => token.includes(roleToken))) return role;
  }
  return "supporting";
};

export const createPuppetPalette = (artifactId) => {
  const role = detectPuppetRole(artifactId);
  const rolePalettes = PALETTES_BY_ROLE[role] ?? PALETTES_BY_ROLE.supporting;
  const index = hashString(String(artifactId ?? "")) % rolePalettes.length;
  const selected = rolePalettes[index];
  return { role, ...selected, rod: "#301b10" };
};

export const createStageLook = (style) => {
  if (typeof style === "string" && style.trim().toLowerCase() === "leather-shadow") {
    return {
      top: "#1a1008",
      mid: "#2e1510",
      bottom: "#110804",
      lampGlow: "#f6c06f",
      curtain: "#3a1208",
      grain: "rgba(255, 230, 180, 0.04)",
      text: "#f4d49f"
    };
  }
  return {
    top: "#1f2233",
    mid: "#2b3450",
    bottom: "#161b29",
    lampGlow: "#d8e2ff",
    curtain: "#20263a",
    grain: "rgba(210, 220, 255, 0.05)",
    text: "#e9efff"
  };
};
