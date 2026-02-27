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

export const createPuppetPose = ({ role, opcode, beat, payload, direction, emotion }) => {
  const normalizedRole = typeof role === "string" ? role : "supporting";
  const normalizedOpcode = typeof opcode === "string" ? opcode.toUpperCase() : "NARRATE";
  const normalizedPayload = payload !== null && typeof payload === "object" ? payload : {};
  const normalizedDirection = direction === -1 ? -1 : 1;
  const normalizedBeat = asFiniteNumber(beat, 0);
  // Primary sway wave — drives idle body oscillation at 60fps with continuous beat counter.
  const wave = Math.sin((normalizedBeat + normalizedDirection * 0.35) * 0.85);
  // Breathing wave — slower 3-second cycle for subtle torso lift.
  const breathWave = Math.sin(normalizedBeat * 0.5);
  // Fast micro-oscillation — used for trembling/rapid movement effects.
  const fastWave = Math.sin(normalizedBeat * 5);

  // Base idle pose: breathing, micro-sway, gentle arm drift.
  let torsoTiltDeg = wave * 2.4;
  let torsoLift = 1.5 + breathWave * 1.5 + Math.max(0, Math.sin(normalizedBeat * 0.45)) * 1.2;
  let headTiltDeg = wave * 3.2;
  let leftShoulderDeg = -18 + wave * 7;
  let rightShoulderDeg = 22 - wave * 7;
  let leftElbowDeg = -18 + wave * 4;
  let rightElbowDeg = 20 - wave * 4;
  // Micro-sway: subtle lateral drift adds life even during pauses.
  let swayPx = wave * 2.5 + Math.sin(normalizedBeat * 1.3 + normalizedDirection) * 1.5;
  // Leg idle pose: slight weight shift between feet.
  let leftHipDeg = -5 + wave * 2;
  let rightHipDeg = 5 - wave * 2;
  let leftKneeDeg = 3;
  let rightKneeDeg = 3;

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

  // --- OPCODE-DRIVEN POSES ---

  if (normalizedOpcode === "BARGE_IN") {
    torsoLift += 7.5;
    torsoTiltDeg += normalizedDirection * 6;
    leftShoulderDeg = -58 + wave * 5;
    rightShoulderDeg = 62 - wave * 5;
    leftElbowDeg = -30;
    rightElbowDeg = 28;
    swayPx += normalizedDirection * 1.8;
  }

  if (normalizedOpcode === "SPEAK") {
    // Speaking: head bobs rapidly, body leans toward conversation partner, one arm gestures.
    torsoLift += 3;
    torsoTiltDeg += normalizedDirection * 1.8;
    // Head bob cycle — fast oscillation simulates speaking mouth/emphasis movements.
    headTiltDeg = 5 * Math.sin(normalizedBeat * 6) + normalizedDirection * 2;
    // Right arm makes conversational gesture while speaking.
    rightShoulderDeg = 22 + Math.sin(normalizedBeat * 4) * 15 - wave * 5;
    // Slight weight shift during speaking.
    leftHipDeg = -5 + wave * 3;
    rightHipDeg = 5 - wave * 3;
  }

  if (normalizedOpcode === "LISTEN") {
    // Listening: still, slight lean back, head tilted toward speaker.
    torsoTiltDeg = -3 + wave * 0.5;
    headTiltDeg = normalizedDirection * 8;
    leftShoulderDeg = -12;
    rightShoulderDeg = 12;
    swayPx *= 0.3;
  }

  if (normalizedOpcode === "GESTURE") {
    torsoLift += 4.5;
    const gesture = typeof normalizedPayload.gesture === "string" ? normalizedPayload.gesture.toLowerCase() : "raise_arm";

    switch (gesture) {
      case "bow":
        torsoTiltDeg += 20;
        headTiltDeg += 25;
        leftShoulderDeg = 10;
        rightShoulderDeg = -10;
        leftElbowDeg = 5;
        rightElbowDeg = -5;
        leftKneeDeg = 15;
        rightKneeDeg = 15;
        break;
      case "raise_arm": {
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
        break;
      }
      case "shake_head":
        headTiltDeg = wave * 15;
        torsoTiltDeg = wave * 3;
        break;
      case "dance":
        // Rhythmic full-body dance: wide sway, alternating arms, bouncing torso.
        torsoLift += 5 + Math.abs(Math.sin(normalizedBeat * 3)) * 8;
        leftShoulderDeg = -50 + wave * 30;
        rightShoulderDeg = 50 - wave * 30;
        torsoTiltDeg = wave * 12;
        swayPx = wave * 8;
        headTiltDeg = Math.sin(normalizedBeat * 2) * 10;
        // Dance: wide hip alternation, high knee lifts.
        leftHipDeg = -35 * Math.sin(normalizedBeat * 3);
        rightHipDeg = 35 * Math.sin(normalizedBeat * 3 + Math.PI);
        leftKneeDeg = 15 + 30 * Math.max(0, Math.sin(normalizedBeat * 3));
        rightKneeDeg = 15 + 30 * Math.max(0, -Math.sin(normalizedBeat * 3));
        break;
      case "fight":
        // Combat: rapid arm strikes, lunging torso, alternating attack pattern.
        torsoLift += 4;
        leftShoulderDeg = -70 + wave * 20;
        rightShoulderDeg = 70 - wave * 20;
        torsoTiltDeg += normalizedDirection * 10 + wave * 8;
        swayPx += normalizedDirection * 3;
        // Fight lunge: front knee bent, back leg extended wide.
        leftHipDeg = normalizedDirection > 0 ? -20 : 15;
        rightHipDeg = normalizedDirection > 0 ? 15 : -20;
        leftKneeDeg = normalizedDirection > 0 ? 30 : 5;
        rightKneeDeg = normalizedDirection > 0 ? 5 : 30;
        break;
      case "kneel":
        torsoLift -= 20;
        torsoTiltDeg += 10;
        headTiltDeg += 8;
        // One knee at 90°, other forward.
        leftHipDeg = 10;
        rightHipDeg = -5;
        leftKneeDeg = 90;
        rightKneeDeg = 15;
        break;
      case "joyful":
        // Joy: bouncing, raised arms, wide sway.
        torsoLift += 5 + Math.abs(Math.sin(normalizedBeat * 4)) * 10;
        leftShoulderDeg = -42 + wave * 10;
        rightShoulderDeg = -42 - wave * 10;
        torsoTiltDeg = wave * 8;
        headTiltDeg = Math.sin(normalizedBeat * 3) * 8;
        // Joyful bounce: both knees bend and extend rapidly.
        leftKneeDeg = 5 + 20 * Math.abs(Math.sin(normalizedBeat * 4));
        rightKneeDeg = 5 + 20 * Math.abs(Math.sin(normalizedBeat * 4));
        break;
      case "angry":
        // Anger: forward lunge, arms wide, rapid shake.
        torsoTiltDeg += normalizedDirection * 12 + fastWave * 2;
        leftShoulderDeg = -80 + wave * 15;
        rightShoulderDeg = 80 - wave * 15;
        torsoLift += 5;
        headTiltDeg = fastWave * 4;
        // Wide aggressive stance.
        leftHipDeg = -15;
        rightHipDeg = 15;
        break;
      case "cunning":
        // Cunning: slow lateral slide, deliberate head tilt, arms close.
        headTiltDeg = 15 * normalizedDirection;
        torsoTiltDeg = -5;
        // Slow sine for deliberate sliding movement.
        swayPx = Math.sin(normalizedBeat * 0.5) * 8;
        leftShoulderDeg = -8;
        rightShoulderDeg = 8;
        break;
      case "surprised":
        // Surprise: quick backward jerk, upward head, arms out wide.
        torsoTiltDeg = -8;
        headTiltDeg = -12;
        leftShoulderDeg = -65 + wave * 5;
        rightShoulderDeg = 65 - wave * 5;
        torsoLift += 6;
        break;
      case "fearful":
        // Fear: trembling, hunched, backward.
        torsoTiltDeg = -6 + fastWave * 3;
        headTiltDeg = 10 + fastWave * 2;
        swayPx = fastWave * 3;
        leftShoulderDeg = -30 + fastWave * 5;
        rightShoulderDeg = 30 - fastWave * 5;
        torsoLift -= 2;
        // Knees bent inward, trembling.
        leftHipDeg = -8 + fastWave * 3;
        rightHipDeg = 8 + fastWave * 3;
        leftKneeDeg = 20 + fastWave * 5;
        rightKneeDeg = 20 + fastWave * 5;
        break;
      case "sad":
        // Sadness: head bowed low, slow weighted movement, arms limp.
        headTiltDeg = 15;
        torsoTiltDeg = 8;
        leftShoulderDeg = -5;
        rightShoulderDeg = 5;
        leftElbowDeg = 5;
        rightElbowDeg = -5;
        torsoLift -= 2;
        swayPx *= 0.2;
        break;
      case "walking":
        // Walk: alternating arm swing in sync with movement.
        leftShoulderDeg = -30 * Math.sin(normalizedBeat * 3);
        rightShoulderDeg = 30 * Math.sin(normalizedBeat * 3 + Math.PI);
        torsoTiltDeg = wave * 5;
        // Walk cycle: alternating hip swing and knee bend.
        leftHipDeg = -25 * Math.sin(normalizedBeat * 3);
        rightHipDeg = 25 * Math.sin(normalizedBeat * 3);
        leftKneeDeg = 15 + 15 * Math.max(0, Math.sin(normalizedBeat * 3));
        rightKneeDeg = 15 + 15 * Math.max(0, -Math.sin(normalizedBeat * 3));
        break;
      default: {
        // Fallback to right arm raise.
        leftShoulderDeg = 10;
        rightShoulderDeg = -76;
        leftElbowDeg = -20;
        rightElbowDeg = 10;
      }
    }
  }

  // EMOTE: sustained emotional body state (set between dialogue beats).
  if (normalizedOpcode === "EMOTE") {
    const emotionType = typeof normalizedPayload.emotion === "string"
      ? normalizedPayload.emotion.toLowerCase()
      : (typeof emotion === "string" ? emotion.toLowerCase() : "neutral");

    switch (emotionType) {
      case "angry":
        torsoTiltDeg += normalizedDirection * 8 + fastWave * 1.5;
        leftShoulderDeg = -55 + wave * 10;
        rightShoulderDeg = 55 - wave * 10;
        torsoLift += 4;
        break;
      case "joyful":
        torsoLift += 4 + Math.abs(breathWave) * 6;
        leftShoulderDeg = -35 + wave * 8;
        rightShoulderDeg = -35 - wave * 8;
        headTiltDeg = breathWave * 6;
        break;
      case "cunning":
        headTiltDeg = 12 * normalizedDirection;
        torsoTiltDeg = -4;
        swayPx = Math.sin(normalizedBeat * 0.6) * 6;
        break;
      case "surprised":
        torsoTiltDeg = -6;
        headTiltDeg = -8;
        leftShoulderDeg = -50;
        rightShoulderDeg = 50;
        torsoLift += 5;
        break;
      case "fearful":
        torsoTiltDeg = -5 + fastWave * 2;
        headTiltDeg = 8 + fastWave;
        swayPx = fastWave * 2;
        break;
      case "sad":
        headTiltDeg = 12;
        torsoTiltDeg = 6;
        leftShoulderDeg = -4;
        rightShoulderDeg = 4;
        swayPx *= 0.3;
        break;
      case "listen":
        torsoTiltDeg = -3;
        headTiltDeg = normalizedDirection * 6;
        swayPx *= 0.4;
        break;
      default:
        break;
    }
  }

  // Helper: apply locomotion cycle based on style parameter.
  // Styles: walk (default), hop, crawl, sneak, run.
  const applyLocomotionStyle = (style) => {
    const loco = typeof style === "string" ? style.toLowerCase() : "walk";
    if (loco === "hop") {
      // Hop: both legs bend and extend together.
      leftShoulderDeg = -20 * Math.sin(normalizedBeat * 4);
      rightShoulderDeg = -20 * Math.sin(normalizedBeat * 4);
      torsoLift += 4 + 6 * Math.abs(Math.sin(normalizedBeat * 4));
      leftHipDeg = -10 * Math.sin(normalizedBeat * 4);
      rightHipDeg = -10 * Math.sin(normalizedBeat * 4);
      leftKneeDeg = 5 + 25 * Math.abs(Math.sin(normalizedBeat * 4));
      rightKneeDeg = 5 + 25 * Math.abs(Math.sin(normalizedBeat * 4));
    } else if (loco === "crawl") {
      // Crawl: low wide stance, exaggerated hip movement.
      torsoTiltDeg = wave * 8;
      torsoLift -= 8;
      leftShoulderDeg = -25 * Math.sin(normalizedBeat * 2);
      rightShoulderDeg = 25 * Math.sin(normalizedBeat * 2 + Math.PI);
      leftHipDeg = -35 * Math.sin(normalizedBeat * 2);
      rightHipDeg = 35 * Math.sin(normalizedBeat * 2);
      leftKneeDeg = 20 + 20 * Math.max(0, Math.sin(normalizedBeat * 2));
      rightKneeDeg = 20 + 20 * Math.max(0, -Math.sin(normalizedBeat * 2));
    } else if (loco === "sneak") {
      // Sneak: slow exaggerated high-knee steps.
      leftShoulderDeg = -15 * Math.sin(normalizedBeat * 1.5);
      rightShoulderDeg = 15 * Math.sin(normalizedBeat * 1.5 + Math.PI);
      torsoTiltDeg = wave * 3;
      leftHipDeg = -20 * Math.sin(normalizedBeat * 1.5);
      rightHipDeg = 20 * Math.sin(normalizedBeat * 1.5);
      leftKneeDeg = 10 + 35 * Math.max(0, Math.sin(normalizedBeat * 1.5));
      rightKneeDeg = 10 + 35 * Math.max(0, -Math.sin(normalizedBeat * 1.5));
    } else if (loco === "run") {
      // Run: fast wide arm swing and leg cycle.
      leftShoulderDeg = -45 * Math.sin(normalizedBeat * 5);
      rightShoulderDeg = 45 * Math.sin(normalizedBeat * 5 + Math.PI);
      torsoTiltDeg = normalizedDirection * 8 + wave * 4;
      leftHipDeg = -35 * Math.sin(normalizedBeat * 5);
      rightHipDeg = 35 * Math.sin(normalizedBeat * 5);
      leftKneeDeg = 20 + 25 * Math.max(0, Math.sin(normalizedBeat * 5));
      rightKneeDeg = 20 + 25 * Math.max(0, -Math.sin(normalizedBeat * 5));
    } else {
      // Default walk: standard alternating step.
      leftShoulderDeg = -30 * Math.sin(normalizedBeat * 3);
      rightShoulderDeg = 30 * Math.sin(normalizedBeat * 3 + Math.PI);
      torsoTiltDeg = wave * 4;
      leftHipDeg = -25 * Math.sin(normalizedBeat * 3);
      rightHipDeg = 25 * Math.sin(normalizedBeat * 3);
      leftKneeDeg = 15 + 15 * Math.max(0, Math.sin(normalizedBeat * 3));
      rightKneeDeg = 15 + 15 * Math.max(0, -Math.sin(normalizedBeat * 3));
    }
  };

  // ENTER: puppet slides in from offscreen — show walking pose with leg cycle.
  if (normalizedOpcode === "ENTER") {
    applyLocomotionStyle(normalizedPayload.style ?? "walk");
  }

  // EXIT: puppet slides offscreen — show walking/departing pose with leg cycle.
  if (normalizedOpcode === "EXIT") {
    torsoLift = Math.max(0, torsoLift - 1);
    torsoTiltDeg = normalizedDirection * 5;
    applyLocomotionStyle(normalizedPayload.style ?? "walk");
  }

  // MOVE: walking pose while repositioning on stage with leg cycle.
  if (normalizedOpcode === "MOVE") {
    applyLocomotionStyle(normalizedPayload.style ?? "walk");
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
    torsoTiltDeg: clamp(torsoTiltDeg, -20, 20),
    torsoLift: clamp(torsoLift, -20, 20),
    headTiltDeg: clamp(headTiltDeg, -25, 25),
    leftShoulderDeg: clamp(leftShoulderDeg, -90, 90),
    rightShoulderDeg: clamp(rightShoulderDeg, -90, 90),
    leftElbowDeg: clamp(leftElbowDeg, -40, 40),
    rightElbowDeg: clamp(rightElbowDeg, -40, 40),
    swayPx: clamp(swayPx, -12, 12),
    leftHipDeg: clamp(leftHipDeg, -60, 60),
    rightHipDeg: clamp(rightHipDeg, -60, 60),
    leftKneeDeg: clamp(leftKneeDeg, -30, 90),
    rightKneeDeg: clamp(rightKneeDeg, -30, 90)
  };
};
