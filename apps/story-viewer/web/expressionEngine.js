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
    // Physical gestures keep the character's face neutral — the arm overlay provides the visual action.
    if (emotion === "pick_up" || emotion === "throw" || emotion === "drink") return "neutral";
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
  isSpeaking: false,
  // Emotion pop: 1.0 on expression change, decays to 0 over ~250ms
  emotionPop: 0,
  // Tracks what expression was REQUESTED even if image not yet loaded (race fix).
  desiredKey: "neutral",
  // Spring follow-through pixel offset for hair zone (4-zone segmentation).
  hairOffset: 0,
  // X position of character being looked at (gaze tracking).
  gazeTargetX: 0,
  // Current interpolated gaze horizontal offset in pixels.
  gazeOffsetX: 0,
  // Radians of head tilt on emotion change.
  emotionTilt: 0,
  // Vertical offset for sad (drooping) emotion.
  emotionTiltOffsetY: 0,
  // One-shot physical gesture overlay animation (uses performance.now() like enterTime/blink)
  gestureType: null,       // "pick_up" | "throw" | "drink" | null
  gestureStartedAt: null   // performance.now() timestamp when gesture triggered
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
  // If this matches the desired expression that was previously unavailable, trigger now.
  // Reason: EMOTE may arrive before Gemini finishes generating the expression image.
  // desiredKey remembers the intent; when the image finally loads we start the crossfade.
  if (state.desiredKey === key && state.currentKey !== key) {
    state.targetKey = key;
    state.crossfadeProgress = 0;
    state.emotionPop = 1.0;
  }
};

/**
 * Trigger a one-shot physical gesture animation (pick_up, throw, drink).
 * Uses performance.now() for timing — consistent with enterTime/blink patterns.
 *
 * @param {object} state - Expression state from createExpressionState().
 * @param {string} gestureType - "pick_up" | "throw" | "drink".
 */
export const triggerGesture = (state, gestureType) => {
  state.gestureType = gestureType;
  state.gestureStartedAt = performance.now();
};

/**
 * Set the target expression. Begins crossfade from current → target.
 *
 * @param {object} state - Expression state.
 * @param {string} key - Target expression key.
 */
const TILT_MAP = { happy: 0.02, sad: -0.01, angry: 0, neutral: 0 };

export const setTargetExpression = (state, key) => {
  state.desiredKey = key;  // always remember intent even if image not loaded yet
  const resolvedKey = state.expressions.has(key) ? key : "neutral";
  if (resolvedKey === state.currentKey && resolvedKey === state.targetKey) return;
  state.targetKey = resolvedKey;
  state.crossfadeProgress = 0;
  // Trigger emotion pop burst when expression actually changes.
  state.emotionPop = 1.0;
  // Emotion-driven head tilt (decays over ~800ms in drawCharacter).
  state.emotionTilt = TILT_MAP[resolvedKey] ?? 0;
  state.emotionTiltOffsetY = resolvedKey === "sad" ? 2 : 0;
};

/**
 * Set the gaze target X position (another character's stage position).
 * The face zone will subtly shift toward this position during drawing.
 *
 * @param {object} state - Expression state.
 * @param {number} targetX - X position to look toward.
 */
export const setGazeTarget = (state, targetX) => {
  state.gazeTargetX = targetX;
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

const GESTURE_DURATION_MS = 700;

/**
 * Draw a one-shot physical gesture overlay (arm arc) on the character.
 * Called inside drawCharacter when gestureStartedAt is set.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} state - Expression state (gestureType, gestureStartedAt).
 * @param {number} drawX - Portrait center X (0 in local transform).
 * @param {number} drawY - Portrait top Y (negative drawH in local transform).
 * @param {number} drawW - Portrait draw width.
 * @param {number} drawH - Portrait draw height.
 */
const drawGestureOverlay = (ctx, state, drawX, drawY, drawW, drawH) => {
  const elapsed = performance.now() - state.gestureStartedAt;
  const t = Math.min(1.0, elapsed / GESTURE_DURATION_MS);
  if (t >= 1.0) { state.gestureType = null; state.gestureStartedAt = null; return; }

  // arc progress: sin curve peaks at mid-animation (t=0.5)
  const arc = Math.sin(t * Math.PI);

  ctx.save();
  ctx.globalAlpha = (1 - t) * 0.75;  // fade out as gesture ends
  ctx.strokeStyle = "rgba(40,20,0,0.7)";
  ctx.lineWidth = drawW * 0.07;
  ctx.lineCap = "round";

  const shoulderX = drawX + drawW * 0.28;
  const shoulderY = drawY + drawH * 0.28;  // upper chest area

  if (state.gestureType === "pick_up") {
    // Arm arcs downward (toward floor) and back — simulates bending to pick up
    const peakX = shoulderX + drawW * 0.15;
    const peakY = shoulderY + drawH * 0.55 * arc;  // extend downward at peak
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.quadraticCurveTo(peakX, shoulderY + drawH * 0.3 * arc, peakX, peakY);
    ctx.stroke();
    // Small circle at hand tip (the stone being picked up)
    ctx.beginPath();
    ctx.arc(peakX, peakY, drawW * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(130,100,70,0.8)";
    ctx.fill();
  } else if (state.gestureType === "throw") {
    // Arm arcs forward-upward — simulates throwing motion
    const extendX = shoulderX + drawW * 0.45 * arc;
    const extendY = shoulderY - drawH * 0.15 * arc;  // slight upward angle
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.quadraticCurveTo(
      shoulderX + drawW * 0.2 * arc, shoulderY - drawH * 0.05,
      extendX, extendY
    );
    ctx.stroke();
    // Projectile stone that travels forward and fades
    if (t > 0.3) {
      const stoneProgress = (t - 0.3) / 0.7;
      const stoneX = extendX + drawW * 0.3 * stoneProgress;
      const stoneY = extendY + drawH * 0.1 * stoneProgress;
      ctx.globalAlpha = (1 - stoneProgress) * 0.7;
      ctx.beginPath();
      ctx.arc(stoneX, stoneY, drawW * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(110,90,70,0.85)";
      ctx.fill();
    }
  } else if (state.gestureType === "drink") {
    // Arm arcs upward toward head — simulates drinking from vessel
    const vesselX = shoulderX + drawW * 0.1;
    const vesselY = shoulderY - drawH * 0.18 * arc;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY + drawH * 0.05);
    ctx.quadraticCurveTo(vesselX, shoulderY - drawH * 0.08 * arc, vesselX, vesselY);
    ctx.stroke();
    // Small cup/vessel outline at tip
    ctx.beginPath();
    ctx.arc(vesselX, vesselY, drawW * 0.07, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(80,140,200,0.7)";
    ctx.lineWidth = drawW * 0.04;
    ctx.stroke();
  }

  ctx.restore();
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
 * @param {boolean} [isMoving=false] - Whether the character is currently walking to a new position.
 */
export const drawCharacter = (ctx, state, beat, dt, slotX, slotY, slotW, slotH, globalAlpha = 1.0, isMoving = false) => {
  updateCrossfade(state, dt);
  updateBlink(state);

  const currentImg = state.expressions.get(state.currentKey) || state.expressions.get("neutral");
  const targetImg = state.expressions.get(state.targetKey) || state.expressions.get("neutral");

  if (!currentImg && !targetImg) {
    // No portrait available yet — skip drawing entirely.
    // Reason: the gray placeholder rectangle was visible as a "faded box" artifact
    // for the first 5-10 seconds while character portraits are being generated.
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

  // Combined vertical scale — breathing is now torso-local (4-zone segmentation).
  const totalScaleY = (1 + speakPulse) * entryScaleY;
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

  // Walk cycle physics: sinusoidal Y-bob + lean when moving.
  // Reason: without walk cycle, characters slide mechanically; this creates the
  // illusion of actual footsteps. Bob uses Math.abs for always-upward bounce.
  const walkBob = isMoving ? Math.abs(Math.sin(beat * 4)) * 4 : 0; // 0–4px upward
  const walkLean = isMoving ? Math.sin(beat * 4) * 0.03 : 0; // ±0.03 rad (~1.7°) lean

  // Translate to feet anchor; scale transforms are applied relative to this point.
  // walkBob is subtracted because canvas Y increases downward — subtracting moves character UP.
  ctx.translate(slotX, slotY + speakBob - walkBob);

  // Idle sway — desynchronized per character using charId char code as phase offset.
  // Reason: without a phase offset every character sways in unison, which looks mechanical.
  const swayPhase = state.charId ? state.charId.charCodeAt(0) * 0.7 : 0;
  const idleSway = Math.sin(beat * 0.3 + swayPhase) * 0.015; // ±0.015 radians (~0.86°)
  ctx.rotate(idleSway + walkLean); // walkLean adds to idleSway; does not replace it

  ctx.scale(totalScaleX, totalScaleY);

  // Emotion pop — squash-stretch burst on expression change, decays over ~250ms.
  // emotionPop starts at 1.0 and decays to 0 at rate dt*4 (~250ms total).
  // easeOutBack maps the remaining 1→0 range so the scale overshoots then settles.
  if (state.emotionPop > 0) {
    const popProgress = easeOutBack(state.emotionPop);
    const popScaleY = 1.0 + popProgress * 0.08; // peak: 8% taller
    const popScaleX = 1.0 / popScaleY;           // conservation of volume
    ctx.scale(popScaleX, popScaleY);
    state.emotionPop = Math.max(0, state.emotionPop - dt * 4); // decay over 250ms
  }

  // Draw current expression.
  const drawW = fit.drawW;
  const drawH = fit.drawH;
  const drawX = -drawW / 2;
  const drawY = -drawH; // anchored at bottom (feet)

  // 4-zone body segmentation for independent micro-animations per body region.
  // Hair trails behind body sway (spring follow-through), face bobs + gazes,
  // torso breathes independently, legs stay anchored.
  const ZONE_HAIR  = 0.15;  // 0–15%: hair/crown
  const ZONE_FACE  = 0.40;  // 15–40%: face
  const ZONE_TORSO = 0.75;  // 40–75%: torso
  // 75–100%: legs/base (remainder)

  // Speaking head bob: 3Hz independent of whole-body speakBob (2Hz).
  const headBob = state.isSpeaking ? Math.sin(beat * 3) * 1.5 : 0;

  // Per-frame spring/gaze/tilt updates (reuses swayPhase from idle sway above).
  const bodySway = Math.sin(beat * 0.3 + swayPhase) * 3;
  state.hairOffset += (bodySway - state.hairOffset) * 0.04; // spring follow-through

  if (state.gazeTargetX !== 0) {
    const gazeDir = Math.sign(state.gazeTargetX - slotX);
    state.gazeOffsetX += (gazeDir * 4 - state.gazeOffsetX) * 0.03;
  }

  // Emotion tilt decay (~800ms).
  if (Math.abs(state.emotionTilt) > 0.001) state.emotionTilt *= Math.max(0, 1 - dt * 1.25);
  if (Math.abs(state.emotionTiltOffsetY) > 0.01) state.emotionTiltOffsetY *= Math.max(0, 1 - dt * 1.25);

  // Torso-local breathing: horizontal chest expansion only.
  const torsoBreathScaleX = 1.0 + Math.sin(beat * 0.5) * 0.008;

  /**
   * Draw a single portrait canvas in 4 independent zones:
   * legs (anchored), torso (breathing), face (bob + gaze + tilt), hair (spring follow-through).
   * Each zone overlaps by 1px to prevent sub-pixel seam gaps.
   *
   * @param {HTMLCanvasElement} canvas - Portrait canvas to draw.
   */
  const drawSplit = (canvas) => {
    const cW = canvas.width || canvas.naturalWidth || drawW;
    const cH = canvas.height || canvas.naturalHeight || drawH;

    // Source pixel boundaries.
    const hairSrcEnd  = Math.floor(cH * ZONE_HAIR);
    const faceSrcEnd  = Math.floor(cH * ZONE_FACE);
    const torsoSrcEnd = Math.floor(cH * ZONE_TORSO);

    // Destination pixel boundaries (match source proportions to drawH).
    const hairDrawH  = Math.floor(drawH * ZONE_HAIR);
    const faceDrawH  = Math.floor(drawH * (ZONE_FACE - ZONE_HAIR));
    const torsoDrawH = Math.floor(drawH * (ZONE_TORSO - ZONE_FACE));
    const legsDrawH  = drawH - hairDrawH - faceDrawH - torsoDrawH;

    // 1. Legs (75–100%) — fully anchored, no transform.
    const legsSrcY = torsoSrcEnd;
    const legsSrcH = cH - torsoSrcEnd;
    const legsDestY = drawY + hairDrawH + faceDrawH + torsoDrawH;
    ctx.drawImage(canvas, 0, legsSrcY, cW, legsSrcH, drawX, legsDestY, drawW, legsDrawH);

    // 2. Torso (40–75%) — breathing via horizontal chest expansion.
    const torsoSrcY = faceSrcEnd;
    const torsoSrcH = torsoSrcEnd - faceSrcEnd;
    const torsoDestY = drawY + hairDrawH + faceDrawH;
    ctx.save();
    const torsoCenterX = drawX + drawW / 2;
    const torsoCenterY = torsoDestY + torsoDrawH / 2;
    ctx.translate(torsoCenterX, torsoCenterY);
    ctx.scale(torsoBreathScaleX, 1.0);
    ctx.translate(-torsoCenterX, -torsoCenterY);
    ctx.drawImage(canvas, 0, torsoSrcY, cW, torsoSrcH + 1, drawX, torsoDestY - 1, drawW, torsoDrawH + 2);
    ctx.restore();

    // 3. Face (15–40%) — headBob + gazeOffsetX + emotionTilt rotation.
    const faceSrcY = hairSrcEnd;
    const faceSrcH = faceSrcEnd - hairSrcEnd;
    const faceDestY = drawY + hairDrawH;
    ctx.save();
    const faceCenterX = drawX + drawW / 2 + state.gazeOffsetX;
    const faceCenterY = faceDestY + faceDrawH / 2 + headBob + state.emotionTiltOffsetY;
    ctx.translate(faceCenterX, faceCenterY);
    ctx.rotate(state.emotionTilt);
    ctx.translate(-faceCenterX, -faceCenterY);
    ctx.drawImage(
      canvas, 0, faceSrcY, cW, faceSrcH + 1,
      drawX + state.gazeOffsetX, faceDestY + headBob + state.emotionTiltOffsetY - 1, drawW, faceDrawH + 2
    );
    ctx.restore();

    // 4. Hair (0–15%) — spring follow-through from body sway + headBob.
    const hairSrcH = hairSrcEnd;
    ctx.drawImage(
      canvas, 0, 0, cW, hairSrcH + 1,
      drawX + state.hairOffset, drawY + headBob - 1, drawW, hairDrawH + 2
    );
  };

  if (state.crossfadeProgress >= 1.0 || !targetImg || currentImg === targetImg) {
    // No crossfade active — draw current directly (split).
    if (currentImg) {
      drawSplit(currentImg);
    }
  } else {
    // Crossfade: draw current at (1 - progress) alpha, target at progress alpha.
    // Both draws use the head/body split so the bob applies throughout the transition.
    const fromAlpha = easeInOutCubic(1 - state.crossfadeProgress);
    const toAlpha = easeInOutCubic(state.crossfadeProgress);

    if (currentImg) {
      ctx.globalAlpha = globalAlpha * fromAlpha;
      drawSplit(currentImg);
    }
    if (targetImg) {
      ctx.globalAlpha = globalAlpha * toAlpha;
      drawSplit(targetImg);
    }
    ctx.globalAlpha = globalAlpha;
  }

  // Blink simulation: brief alpha dip on the upper 20% of the FULL character area.
  // Intentionally not split — the blink rect spans the whole portrait width/height
  // so it correctly dims whichever part of the face is visible regardless of bob offset.
  if (state.blinkActive) {
    const blinkH = drawH * 0.2;
    ctx.globalAlpha = globalAlpha * 0.25; // dim to 25% alpha (eyelid over face)
    ctx.fillStyle = "rgba(20, 10, 5, 1)";
    ctx.fillRect(drawX, drawY, drawW, blinkH);
    ctx.globalAlpha = globalAlpha;
  }

  // One-shot physical gesture overlay (pick_up, throw, drink).
  // drawX=0, drawY=-drawH because ctx is translated so feet are at (0,0).
  if (state.gestureType && state.gestureStartedAt !== null) {
    drawGestureOverlay(ctx, state, 0, -drawH, drawW, drawH);
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
  // Width-first fit: cap drawW at 70% of slotH (preserves separation between
  // two characters at center_left/center_right), then derive drawH from drawW
  // to preserve the image's native aspect ratio.
  // Previously drawH was always slotH, which stretched square (1:1) portraits
  // 43% taller than wide. Now: for 1:1 → drawW=238, drawH=238; for 0.75
  // portrait → drawW=238, drawH=317 (correctly tall but not distorted).
  const drawW = Math.min(slotH * imgAspect, slotH * 0.70);
  const drawH = drawW / imgAspect;   // preserve aspect ratio — was always slotH before

  return {
    drawW,
    drawH,
    offsetX: (slotW - drawW) / 2,
    offsetY: 0  // anchored at bottom via drawY = -drawH in drawCharacter
  };
};
