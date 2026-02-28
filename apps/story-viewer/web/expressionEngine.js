/**
 * expressionEngine.js — Per-character expression state with crossfade and micro-animations.
 *
 * Research basis:
 *   - Cuphead: snappy crossfades (250ms) over smooth interpolation between many frames
 *   - Visual Novel (Ren'Py): breathing oscillation + idle micro-sway = "alive" character
 *   - Disney: squash/stretch on entry (easeOutBack anticipation + follow-through)
 *   - VTuber / Live2D: blink simulation + speaking motion from whole-portrait transforms
 */

// ─── Easing Functions ────────────────────────────────────────────────────────

export const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** easeOutBack — overshoot then settle. Used for entry squash/stretch. */
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ─── Expression Resolution ───────────────────────────────────────────────────

/**
 * Map NatyaScript opcode + emotion/gesture to an expression key.
 * Returns one of: "neutral" | "happy" | "angry" | "sad"
 *
 * @param {string} opcode - NatyaScript opcode.
 * @param {object} payload - Opcode payload.
 * @returns {string} Expression key.
 */
export const resolveExpression = (opcode, payload) => {
  if (opcode === "EMOTE" || opcode === "GESTURE") {
    const emotion = typeof payload.emotion === "string" ? payload.emotion.toLowerCase()
      : typeof payload.gesture === "string" ? payload.gesture.toLowerCase()
      : "";

    if (emotion === "joyful" || emotion === "dance") return "happy";
    if (emotion === "angry" || emotion === "fight") return "angry";
    if (emotion === "sad" || emotion === "fearful" || emotion === "kneel") return "sad";
    if (emotion === "surprised" || emotion === "cunning") return "neutral";
  }

  if (opcode === "SPEAK") return "neutral";
  if (opcode === "BARGE_IN") return "angry";

  return "neutral";
};

// ─── Expression State ────────────────────────────────────────────────────────

/**
 * Create per-character expression state.
 *
 * @param {string} charId - Character identifier.
 * @returns {object} Expression state object.
 */
export const createExpressionState = (charId) => ({
  charId,
  // Map of expression key → HTMLCanvasElement (background-removed)
  expressions: new Map(),
  // Current expression key being displayed
  currentKey: "neutral",
  // Target expression key (when different from current, crossfade is active)
  targetKey: "neutral",
  // Crossfade progress 0→1 (0 = fully current, 1 = fully target)
  crossfadeProgress: 1.0,
  // Crossfade duration in ms (Cuphead-style: snappy 250ms)
  crossfadeDurationMs: 250,
  // Per-character blink timing (randomize to desync multiple characters)
  nextBlinkAt: performance.now() + 3000 + Math.random() * 2000,
  blinkActive: false,
  blinkEndAt: 0,
  // Entry animation: easeOutBack squash/stretch over 600ms
  enterTime: null,
  enterDurationMs: 600,
  // Speaking state: enables micro-pulse animation
  isSpeaking: false
});

/**
 * Hot-add a new expression image to an existing state.
 * Triggers a crossfade if this is the current target expression.
 *
 * @param {object} state - Expression state from createExpressionState().
 * @param {string} key - Expression key ("happy" | "angry" | "sad" | "neutral").
 * @param {HTMLCanvasElement|HTMLImageElement} canvas - Background-removed image.
 */
export const addExpression = (state, key, canvas) => {
  state.expressions.set(key, canvas);
  // If this is the target expression and we don't have it yet, trigger crossfade.
  if (key === state.targetKey && state.currentKey !== key) {
    state.crossfadeProgress = 0;
  }
};

/**
 * Set the target expression. Begins crossfade from current → target.
 *
 * @param {object} state - Expression state.
 * @param {string} key - Target expression key.
 */
export const setTargetExpression = (state, key) => {
  const resolvedKey = state.expressions.has(key) ? key : "neutral";
  if (resolvedKey === state.currentKey) return;
  state.targetKey = resolvedKey;
  state.crossfadeProgress = 0;
};

/**
 * Advance crossfade progress by elapsed time.
 *
 * @param {object} state - Expression state.
 * @param {number} dt - Elapsed time in seconds.
 */
export const updateCrossfade = (state, dt) => {
  if (state.crossfadeProgress >= 1.0) return;

  const step = dt * 1000 / state.crossfadeDurationMs;
  state.crossfadeProgress = Math.min(1.0, state.crossfadeProgress + step);

  // When crossfade completes, commit the target as current.
  if (state.crossfadeProgress >= 1.0) {
    state.currentKey = state.targetKey;
    state.crossfadeProgress = 1.0;
  }
};

/**
 * Update blink simulation state.
 *
 * @param {object} state - Expression state.
 */
const updateBlink = (state) => {
  const now = performance.now();

  if (state.blinkActive) {
    if (now >= state.blinkEndAt) {
      state.blinkActive = false;
      state.nextBlinkAt = now + 3000 + Math.random() * 2000;
    }
  } else if (now >= state.nextBlinkAt) {
    state.blinkActive = true;
    state.blinkEndAt = now + 150;
  }
};

/**
 * Get entry squash/stretch scale factors for ENTER animation.
 * Returns {scaleX, scaleY} — product maintains volume.
 *
 * @param {object} state - Expression state.
 * @returns {{scaleX: number, scaleY: number}} Scale factors.
 */
const getEntrySquash = (state) => {
  if (state.enterTime === null) return { scaleX: 1, scaleY: 1 };

  const elapsed = performance.now() - state.enterTime;
  const t = Math.min(1.0, elapsed / state.enterDurationMs);
  const eased = easeOutBack(t);

  // At t=0: scaleX=1.1, scaleY=0.9 (squash on landing). At t=1: 1.0, 1.0.
  // Inverted: as eased goes 0→1, scale goes squash→normal.
  const squashAmount = 1 - eased;
  const scaleX = 1 + squashAmount * 0.1;   // 1.1 → 1.0
  const scaleY = 1 - squashAmount * 0.1;   // 0.9 → 1.0

  if (t >= 1.0) state.enterTime = null;

  return { scaleX, scaleY };
};

/**
 * Draw a character with expression crossfade and micro-animations.
 * Handles breathing, blink, speaking pulse, and entry squash/stretch.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context.
 * @param {object} state - Expression state.
 * @param {number} beat - Continuous beat counter (advances at 2/sec in rAF loop).
 * @param {number} dt - Elapsed time in seconds.
 * @param {number} slotX - Slot center X in canvas coordinates.
 * @param {number} slotY - Slot bottom Y (feet anchor point) in canvas coordinates.
 * @param {number} slotW - Slot width (180px recommended).
 * @param {number} slotH - Slot height (340px recommended).
 * @param {number} [globalAlpha=1.0] - Alpha override for spotlight dimming.
 */
export const drawCharacter = (ctx, state, beat, dt, slotX, slotY, slotW, slotH, globalAlpha = 1.0) => {
  updateCrossfade(state, dt);
  updateBlink(state);

  const currentImg = state.expressions.get(state.currentKey) || state.expressions.get("neutral");
  const targetImg = state.expressions.get(state.targetKey) || state.expressions.get("neutral");

  if (!currentImg && !targetImg) {
    // No portrait available yet — draw placeholder silhouette.
    ctx.save();
    ctx.globalAlpha = 0.3 * globalAlpha;
    ctx.fillStyle = "#888";
    ctx.fillRect(slotX - slotW / 2, slotY - slotH, slotW, slotH);
    ctx.restore();
    return;
  }

  // Micro-animation parameters.
  // Breathing: 0.5Hz cycle, scaleY 1.0 ↔ 1.012, translateY compensates to anchor feet.
  const breathScale = 1.0 + Math.sin(beat * 0.5) * 0.012;
  const breathLift = slotH * (breathScale - 1.0); // pixels upward to keep feet anchored

  // Speaking micro-pulse: 2Hz when SPEAK active, subtle scaleY + translateY bob.
  const speakPulse = state.isSpeaking ? Math.sin(beat * 2) * 0.008 : 0;
  const speakBob = state.isSpeaking ? Math.sin(beat * 2) * 2 : 0; // ±2px

  // Entry squash/stretch.
  const { scaleX: entryScaleX, scaleY: entryScaleY } = getEntrySquash(state);

  // Combined vertical scale.
  const totalScaleY = breathScale * (1 + speakPulse) * entryScaleY;
  const totalScaleX = entryScaleX; // horizontal scale only from entry

  // Contain-fit: draw image within slot, anchored at bottom (feet).
  const drawImg = currentImg || targetImg;
  const imgW = drawImg.width || drawImg.naturalWidth || slotW;
  const imgH = drawImg.height || drawImg.naturalHeight || slotH;
  const fit = fitPortraitToSlot(imgW, imgH, slotW, slotH);

  // Ground shadow — radial gradient ellipse at character's feet.
  // Gradient is cached on state and only recreated when slotW changes.
  const shadowCenterX = slotX;
  const shadowCenterY = slotY;
  const shadowRadiusX = slotW * 0.35;
  const shadowRadiusY = 8;
  if (!state._shadowGrad || state._shadowSlotW !== slotW) {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowRadiusX);
    grad.addColorStop(0, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    state._shadowGrad = grad;
    state._shadowSlotW = slotW;
  }
  ctx.save();
  ctx.globalAlpha = globalAlpha;
  ctx.translate(shadowCenterX, shadowCenterY);
  ctx.beginPath();
  ctx.ellipse(0, 0, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
  ctx.fillStyle = state._shadowGrad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = globalAlpha;

  // Translate to feet anchor; scale transforms are applied relative to this point.
  ctx.translate(slotX, slotY + breathLift + speakBob);

  // Idle sway — desynchronized per character using charId char code as phase offset.
  // Reason: without a phase offset every character sways in unison, which looks mechanical.
  const swayPhase = state.charId ? state.charId.charCodeAt(0) * 0.7 : 0;
  const idleSway = Math.sin(beat * 0.3 + swayPhase) * 0.015; // ±0.015 radians (~0.86°)
  ctx.rotate(idleSway);

  ctx.scale(totalScaleX, totalScaleY);

  // Draw current expression.
  const drawW = fit.drawW;
  const drawH = fit.drawH;
  const drawX = -drawW / 2;
  const drawY = -drawH; // anchored at bottom (feet)

  if (state.crossfadeProgress >= 1.0 || !targetImg || currentImg === targetImg) {
    // No crossfade active — draw current directly.
    if (currentImg) {
      ctx.drawImage(currentImg, drawX, drawY, drawW, drawH);
    }
  } else {
    // Crossfade: draw current at (1 - progress) alpha, target at progress alpha.
    const fromAlpha = easeInOutCubic(1 - state.crossfadeProgress);
    const toAlpha = easeInOutCubic(state.crossfadeProgress);

    if (currentImg) {
      ctx.globalAlpha = globalAlpha * fromAlpha;
      ctx.drawImage(currentImg, drawX, drawY, drawW, drawH);
    }
    if (targetImg) {
      ctx.globalAlpha = globalAlpha * toAlpha;
      ctx.drawImage(targetImg, drawX, drawY, drawW, drawH);
    }
    ctx.globalAlpha = globalAlpha;
  }

  // Blink simulation: brief alpha dip on upper 20% of the image.
  if (state.blinkActive) {
    const blinkH = drawH * 0.2;
    ctx.globalAlpha = globalAlpha * 0.25; // dim to 25% alpha (eyelid over face)
    ctx.fillStyle = "rgba(20, 10, 5, 1)";
    ctx.fillRect(drawX, drawY, drawW, blinkH);
    ctx.globalAlpha = globalAlpha;
  }

  ctx.restore();
};

// ─── Contain-Fit Helper ──────────────────────────────────────────────────────

/**
 * Calculate contain-fit dimensions for a portrait within a slot.
 * Never stretches — maintains aspect ratio, anchors at bottom.
 *
 * @param {number} imgW - Source image width.
 * @param {number} imgH - Source image height.
 * @param {number} slotW - Target slot width.
 * @param {number} slotH - Target slot height.
 * @returns {{drawW: number, drawH: number, offsetX: number, offsetY: number}}
 */
export const fitPortraitToSlot = (imgW, imgH, slotW, slotH) => {
  if (!imgW || !imgH) return { drawW: slotW, drawH: slotH, offsetX: 0, offsetY: 0 };

  const imgAspect = imgW / imgH;
  // Height-fill: always fill slotH so characters are never tiny.
  // AI portraits are typically 1024×1024 (aspect=1.0) which is wider than
  // the slot aspect (180/340=0.53), so contain-fit would shrink to width=180,
  // height=180 — a tiny square. Height-fill gives height=340, width=340.
  // Cap drawW at 70% of slotH: for 1:1 images this limits to ~238px so two
  // characters at center_left/center_right (gap=320px) have clear separation
  // even after depthScale multiplier is applied.
  const drawH = slotH;
  const drawW = Math.min(slotH * imgAspect, slotH * 0.70);

  return {
    drawW,
    drawH,
    offsetX: (slotW - drawW) / 2,
    offsetY: 0  // anchored at bottom via drawY = -drawH in drawCharacter
  };
};
