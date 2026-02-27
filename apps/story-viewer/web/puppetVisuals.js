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
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const hashString = (value) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0);
};

const asFiniteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const detectPuppetRole = (artifactId) => {
  const token = normalizeToken(String(artifactId ?? ""));

  for (const role of ROLE_PRIORITY) {
    if (ROLE_TOKENS[role].some((roleToken) => token.includes(roleToken))) {
      return role;
    }
  }

  return "supporting";
};

export const createPuppetPalette = (artifactId) => {
  const role = detectPuppetRole(artifactId);
  const rolePalettes = PALETTES_BY_ROLE[role] ?? PALETTES_BY_ROLE.supporting;
  const index = hashString(String(artifactId ?? "")) % rolePalettes.length;
  const selected = rolePalettes[index];

  return {
    role,
    leatherFill: selected.leatherFill,
    leatherShade: selected.leatherShade,
    edge: selected.edge,
    ornament: selected.ornament,
    rod: "#301b10"
  };
};

export const createStageLook = (style) => {
  if (typeof style === "string" && style.trim().toLowerCase() === "leather-shadow") {
    return {
      top: "#2b130b",
      mid: "#4b2114",
      bottom: "#1d0b06",
      lampGlow: "#f6c06f",
      curtain: "#3a1208",
      grain: "rgba(255, 230, 180, 0.06)",
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

export const createLeatherTextureRecipe = (artifactId) => {
  const token = String(artifactId ?? "");
  const role = detectPuppetRole(token);
  const seed = hashString(token);
  const roleTuning = {
    hero: {
      highlightAlpha: 0.2,
      crackAlpha: 0.16,
      grainAlpha: 0.09
    },
    mentor: {
      highlightAlpha: 0.16,
      crackAlpha: 0.19,
      grainAlpha: 0.1
    },
    shadow: {
      highlightAlpha: 0.1,
      crackAlpha: 0.24,
      grainAlpha: 0.11
    },
    supporting: {
      highlightAlpha: 0.14,
      crackAlpha: 0.18,
      grainAlpha: 0.1
    }
  }[role];

  return {
    role,
    seed,
    stitchSpacing: 6 + (seed % 4),
    stitchLength: 3 + ((seed >> 2) % 2),
    seamWobble: 1.6 + ((seed >> 4) % 5) * 0.18,
    grainScale: 0.85 + ((seed >> 9) % 6) * 0.08,
    highlightAlpha: roleTuning.highlightAlpha,
    crackAlpha: roleTuning.crackAlpha,
    grainAlpha: roleTuning.grainAlpha
  };
};

export const createPuppetPose = ({ role, opcode, beat, payload, direction }) => {
  const normalizedRole = typeof role === "string" ? role : "supporting";
  const normalizedOpcode = typeof opcode === "string" ? opcode.toUpperCase() : "NARRATE";
  const normalizedPayload = payload !== null && typeof payload === "object" ? payload : {};
  const normalizedDirection = direction === -1 ? -1 : 1;
  const normalizedBeat = asFiniteNumber(beat, 0);
  const wave = Math.sin((normalizedBeat + normalizedDirection * 0.35) * 0.85);

  let torsoTiltDeg = wave * 2.4;
  let torsoLift = 1.5 + Math.max(0, Math.sin(normalizedBeat * 0.45)) * 1.2;
  let headTiltDeg = wave * 3.2;
  let leftShoulderDeg = -18 + wave * 7;
  let rightShoulderDeg = 22 - wave * 7;
  let leftElbowDeg = -18 + wave * 4;
  let rightElbowDeg = 20 - wave * 4;
  let swayPx = wave * 2.5;

  if (normalizedRole === "mentor") {
    torsoTiltDeg -= 1.4;
    leftShoulderDeg -= 4;
    rightShoulderDeg += 2;
  }

  if (normalizedRole === "shadow") {
    torsoTiltDeg -= 4;
    headTiltDeg -= 2;
    leftShoulderDeg -= 6;
    rightShoulderDeg += 6;
    swayPx *= 0.85;
  }

  if (normalizedOpcode === "BARGE_IN") {
    torsoLift += 7.5;
    torsoTiltDeg += normalizedDirection * 6;
    leftShoulderDeg = -58 + wave * 5;
    rightShoulderDeg = 62 - wave * 5;
    leftElbowDeg = -30;
    rightElbowDeg = 28;
    swayPx += normalizedDirection * 1.8;
  }

  if (normalizedOpcode === "GESTURE") {
    torsoLift += 4.5;
    const hand = typeof normalizedPayload.hand === "string" ? normalizedPayload.hand.toLowerCase() : "right";

    if (hand === "left") {
      leftShoulderDeg = -74;
      rightShoulderDeg = 18;
      leftElbowDeg = -10;
      rightElbowDeg = 18;
    } else {
      leftShoulderDeg = 10;
      rightShoulderDeg = -76;
      leftElbowDeg = -20;
      rightElbowDeg = 10;
    }
  }

  if (normalizedOpcode === "SCENE_CLOSE") {
    torsoLift = Math.max(0, torsoLift - 1.5);
    leftShoulderDeg *= 0.6;
    rightShoulderDeg *= 0.6;
    leftElbowDeg *= 0.6;
    rightElbowDeg *= 0.6;
    headTiltDeg *= 0.5;
  }

  return {
    torsoTiltDeg: clamp(torsoTiltDeg, -16, 16),
    torsoLift: clamp(torsoLift, 0, 16),
    headTiltDeg: clamp(headTiltDeg, -18, 18),
    leftShoulderDeg: clamp(leftShoulderDeg, -90, 90),
    rightShoulderDeg: clamp(rightShoulderDeg, -90, 90),
    leftElbowDeg: clamp(leftElbowDeg, -40, 40),
    rightElbowDeg: clamp(rightElbowDeg, -40, 40),
    swayPx: clamp(swayPx, -8, 8)
  };
};
