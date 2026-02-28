/**
 * stageRenderer.js — Cinematic storybook stage renderer.
 *
 * Replaces the puppet theater system with an expressive portrait-based renderer
 * driven by the cinematic director (CAMERA/EFFECT/SPOTLIGHT stage commands).
 *
 * Architecture:
 *   - expressionEngine.js: per-character expression crossfade + micro-animations
 *   - cinematicEffects.js: camera zoom/shake, particles, screen overlays, spotlight
 *   - This file: draw pipeline, artifact position tracking, backdrop rendering
 */

import {
  createExpressionState,
  addExpression,
  setTargetExpression,
  drawCharacter,
  resolveExpression,
  updateCrossfade
} from "./expressionEngine.js";
import {
  createCamera,
  createParticleSystem,
  createScreenEffects,
  createSpotlight
} from "./cinematicEffects.js";
import { detectPuppetRole, createStageLook, createPuppetPalette } from "./puppetVisuals.js";
import { createSceneTransition } from "./sceneTransition.js";
import { createMoodEngine } from "./moodEngine.js";
import { createSpeechBubbleSystem } from "./speechBubble.js";

// Stage position zones for ENTER/MOVE/EXIT opcodes.
const STAGE_ZONES = {
  offscreen_left: -160,
  left: 140,
  center_left: 210,
  center: 360,
  center_right: 510,
  right: 580,
  offscreen_right: 880
};

// Character slot dimensions (contain-fit within these bounds).
const SLOT_W = 180;
const SLOT_H = 340;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isRecord = (value) => value !== null && typeof value === "object";

/**
 * Remove background pixels from an image by sampling corner colors.
 * Feathers a 10px transition band for smooth edges.
 */
const removeBackground = (img, tolerance = 35) => {
  const offscreen = document.createElement("canvas");
  offscreen.width = img.naturalWidth || img.width;
  offscreen.height = img.naturalHeight || img.height;
  const offCtx = offscreen.getContext("2d");
  offCtx.drawImage(img, 0, 0);
  const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;

  const w = offscreen.width;
  const h = offscreen.height;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const idx = (cy * w + cx) * 4;
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  }
  bgR = Math.round(bgR / 4);
  bgG = Math.round(bgG / 4);
  bgB = Math.round(bgB / 4);

  const featherBand = 10;
  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.max(
      Math.abs(data[i] - bgR),
      Math.abs(data[i + 1] - bgG),
      Math.abs(data[i + 2] - bgB)
    );
    if (dist < tolerance) {
      data[i + 3] = 0;
    } else if (dist < tolerance + featherBand) {
      data[i + 3] = Math.round(((dist - tolerance) / featherBand) * 255);
    }
  }
  offCtx.putImageData(imageData, 0, 0);
  return offscreen;
};

// ─── Backdrop ─────────────────────────────────────────────────────────────────

const drawBackdrop = (ctx, canvas, state) => {
  if (state.backdropImage?.complete && state.backdropImage.naturalWidth > 0) {
    // Ken Burns — imperceptibly slow zoom + pan to add life to static backgrounds
    const kbSpeed = 0.008; // very slow
    const kbZoom = 1.0 + Math.sin(state.beat * kbSpeed) * 0.04;       // 1.0 to 1.04x
    const kbPanX = Math.cos(state.beat * kbSpeed * 0.7) * 8;          // ±8px horizontal
    const kbPanY = Math.sin(state.beat * kbSpeed * 0.5) * 4;          // ±4px vertical

    ctx.save();
    ctx.translate(canvas.width / 2 + kbPanX, canvas.height / 2 + kbPanY);
    ctx.scale(kbZoom, kbZoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    ctx.drawImage(state.backdropImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    // Subtle cinematic overlay — replaces the heavy puppet theater brown overlay.
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // Clean gradient backdrop — no puppet-theater curtains or film grain.
    const stageLook = state.stageLook;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, stageLook.top);
    gradient.addColorStop(0.55, stageLook.mid);
    gradient.addColorStop(1, stageLook.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle ambient glow at center stage.
    const glow = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.4, 20,
      canvas.width * 0.5, canvas.height * 0.5, 280
    );
    glow.addColorStop(0, "rgba(255, 228, 165, 0.18)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
};

// ─── Caption ──────────────────────────────────────────────────────────────────

const drawCaption = (ctx, canvas, caption) => {
  if (!caption?.text) return;

  const bannerHeight = 52;
  const y = canvas.height - bannerHeight;

  ctx.save();
  ctx.fillStyle = "rgba(15, 5, 2, 0.78)";
  ctx.fillRect(0, y, canvas.width, bannerHeight);

  if (caption.speaker) {
    ctx.font = "bold 11px Trebuchet MS";
    ctx.fillStyle = "#e8a45a";
    ctx.fillText(caption.speaker.toUpperCase(), 14, y + 16);
  }

  ctx.font = "14px Trebuchet MS";
  ctx.fillStyle = "#fff3d6";
  const maxWidth = canvas.width - 28;
  const words = caption.text.split(" ");
  let line = "";
  let lineY = caption.speaker ? y + 33 : y + 22;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, 14, lineY);
      line = word;
      lineY += 17;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 14, lineY);
  ctx.restore();
};

// ─── Artifact Management ──────────────────────────────────────────────────────

const ensureArtifact = (state, artifactId) => {
  if (!state.artifacts[artifactId]) {
    const index = Object.keys(state.artifacts).length;
    const x = 140 + index * 190;
    const y = 395;
    state.artifacts[artifactId] = {
      x,
      y,
      targetX: x,
      targetY: y,
      lerpSpeed: 3.5,
      lastOpcode: "INIT",
      lastPayload: {},
      direction: index % 2 === 0 ? 1 : -1,
      // charId for expression engine and spotlight lookups.
      charId: null,
      // Speaking state for micro-pulse animation.
      isSpeaking: false,
      // Entry time for squash/stretch animation.
      enterTime: null,
      // Depth scale factor (distance from camera).
      depthScale: 1.0
    };
  }
  return state.artifacts[artifactId];
};

// ─── Artifact Interpolation ───────────────────────────────────────────────────

const interpolateArtifacts = (state, dt) => {
  for (const artifact of Object.values(state.artifacts)) {
    const speed = artifact.lerpSpeed ?? 3.5;
    const factor = Math.min(1, dt * speed);
    if (artifact.targetX !== undefined) {
      artifact.x += (artifact.targetX - artifact.x) * factor;
    }
    if (artifact.targetY !== undefined) {
      artifact.y += (artifact.targetY - artifact.y) * factor;
    }
  }
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export const createStageRenderer = (canvas) => {
  const ctx = canvas?.getContext("2d");
  const transition = canvas && ctx ? createSceneTransition(canvas, ctx) : null;

  // Cinematic subsystems.
  const camera = canvas ? createCamera(canvas.width, canvas.height) : null;
  const particles = createParticleSystem();
  const screenEffects = canvas ? createScreenEffects(canvas.width, canvas.height) : null;
  const spotlight = createSpotlight();
  const moodEngine = createMoodEngine();
  const speechBubbles = createSpeechBubbleSystem();

  const state = {
    beat: 0,
    artifacts: {},
    stageLook: createStageLook("leather-shadow"),
    backdropImage: null,
    // Expression states per charId.
    expressionStates: new Map(),
    // Cached portrait canvases (background-removed) per charId.
    characterPortraits: new Map(),
    // Portrait version guards.
    portraitVersions: new Map(),
    // Caption overlay.
    caption: null,
    captionTimer: null,
    requestRedraw: null
  };

  let animating = false;
  let animFrameId = null;
  let lastFrameTime = 0;
  let frames = [];
  let frameIndex = 0;
  let timerId = null;

  // Draw once immediately so page-load curtain (staticallyClosed=true) is visible.
  // Uses setTimeout to let the canvas mount in the DOM first.
  if (canvas) {
    setTimeout(() => drawStage(), 0);
  }

  // ─── Get or create expression state for a charId ──────────────────────────

  const getExprState = (charId) => {
    if (!state.expressionStates.has(charId)) {
      state.expressionStates.set(charId, createExpressionState(charId));
    }
    return state.expressionStates.get(charId);
  };

  // ─── Draw Pipeline ────────────────────────────────────────────────────────

  const drawStage = () => {
    if (!ctx || !canvas) return;

    drawBackdrop(ctx, canvas, state);

    // Apply mood engine preset to cinematic subsystems.
    const moodPreset = moodEngine.getPreset();
    if (moodPreset.lighting.type) {
      screenEffects?.setEffect(moodPreset.lighting.type, moodPreset.lighting.intensity);
    }
    if (moodPreset.camera.shakeIntensity > 0) {
      camera?.shake(moodPreset.camera.shakeIntensity * 0.1); // small shake nudge per frame
    }
    // Connect atmospheric particle preset from mood.
    if (moodPreset.particles) {
      particles.setContinuous(moodPreset.particles);
    } else {
      particles.clearContinuous();
    }

    // Apply camera transform before drawing characters.
    camera?.applyTransform(ctx);

    for (const [artifactId, artifact] of Object.entries(state.artifacts)) {
      // Skip director pseudo-artifact.
      if (artifactId === "director") continue;

      const charId = artifact.charId || artifactId;
      const exprState = getExprState(charId);

      // Sync speaking state to expression engine.
      exprState.isSpeaking = artifact.isSpeaking ?? false;
      if (artifact.enterTime !== null && exprState.enterTime === null) {
        exprState.enterTime = artifact.enterTime;
        artifact.enterTime = null;
      }

      const x = artifact.x;
      const y = artifact.y;

      // Depth illusion: characters further back appear slightly smaller.
      const depthScale = 0.78 + clamp((y - 200) / 200, 0, 1) * 0.32;
      artifact.depthScale = depthScale;

      // Spotlight glow behind character (drawn before character).
      spotlight.drawGlow(ctx, charId, x, y - SLOT_H * 0.5 * depthScale, SLOT_H * 0.7 * depthScale);

      // Character alpha from spotlight.
      const charAlpha = spotlight.getAlpha(charId) * depthScale;

      // Character is moving when it has not yet reached its target position.
      const isMoving = artifact.targetX !== undefined &&
        Math.abs(artifact.x - artifact.targetX) > 5;

      // Draw character portrait with expression crossfade + micro-animations.
      drawCharacter(
        ctx,
        exprState,
        state.beat,
        0, // dt is 0 here — updateCrossfade is called in the rAF loop
        x,
        y,
        SLOT_W * depthScale,
        SLOT_H * depthScale,
        charAlpha,
        isMoving  // walk cycle physics
      );
    }

    // Speech bubbles drawn inside camera transform so they shake/zoom with the scene.
    speechBubbles.draw(ctx, state.artifacts, canvas);

    camera?.restoreTransform(ctx);

    // Particles and screen effects in screen space (outside camera transform).
    particles.draw(ctx);
    screenEffects?.draw(ctx, state.beat);
    drawCaption(ctx, canvas, state.caption);
    // Curtain/fade overlay drawn last so it covers everything.
    transition?.draw();
  };

  // ─── Animation Loop ───────────────────────────────────────────────────────

  const animationLoop = (timestamp) => {
    if (!animating) return;
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    state.beat += dt * 2; // advance beat counter for micro-animations
    interpolateArtifacts(state, dt);

    // Update cinematic subsystems.
    camera?.update(dt);
    particles.update(dt);
    screenEffects?.update(dt);
    moodEngine.update(dt);
    speechBubbles.update(dt);

    // Update expression crossfades.
    for (const exprState of state.expressionStates.values()) {
      updateCrossfade(exprState, dt);
    }

    drawStage();
    animFrameId = requestAnimationFrame(animationLoop);
  };

  const startAnimation = () => {
    if (!animating) {
      animating = true;
      lastFrameTime = performance.now();
      animFrameId = requestAnimationFrame(animationLoop);
    }
  };

  const stopAnimation = () => {
    animating = false;
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };

  state.requestRedraw = () => drawStage();

  // ─── Frame Application ────────────────────────────────────────────────────

  const applyFrame = (frame) => {
    const artifactId = frame.command?.target?.artifactId;
    const opcode = frame.command?.opcode;
    const payload = frame.command?.payload ?? {};

    if (!artifactId || !opcode) return;

    // ── Director opcodes ──────────────────────────────────────────────────

    if (opcode === "CAMERA") {
      const shotType = typeof payload.shot === "string" ? payload.shot : "medium";
      // Resolve target character position (by role → artifactId lookup).
      const targetRole = typeof payload.target === "string" ? payload.target : "";
      let targetX = null, targetY = null;
      if (targetRole) {
        // Find the artifact for this role.
        for (const [aId, art] of Object.entries(state.artifacts)) {
          if (aId.includes(targetRole) || art.charId === targetRole) {
            targetX = art.x;
            targetY = art.y - SLOT_H * 0.5;
            break;
          }
        }
      }
      camera?.focusOn(targetX, targetY, shotType);
      if (payload.shake) {
        camera?.shake(Number(payload.shake));
      }
      return;
    }

    if (opcode === "EFFECT") {
      const effectType = typeof payload.effectType === "string" ? payload.effectType : "";
      const intensity = typeof payload.intensity === "number" ? payload.intensity : 0.5;
      if (effectType) screenEffects?.setEffect(effectType, intensity);
      return;
    }

    if (opcode === "SPOTLIGHT") {
      const targetRole = typeof payload.target === "string" ? payload.target : "";
      const dimOthers = payload.dim_others === true;
      // Resolve target charId from role.
      let targetCharId = targetRole || null;
      if (targetRole) {
        for (const [aId, art] of Object.entries(state.artifacts)) {
          if (aId.includes(targetRole) || art.charId === targetRole) {
            targetCharId = art.charId || aId;
            break;
          }
        }
      }
      spotlight.setTarget(targetCharId, dimOthers);
      return;
    }

    // ── Story opcodes ─────────────────────────────────────────────────────

    const artifact = ensureArtifact(state, artifactId);
    artifact.lastOpcode = opcode;
    artifact.lastPayload = payload;

    // Map artifact to charId if not set (via role payload).
    if (!artifact.charId && typeof payload.role === "string") {
      artifact.charId = payload.role;
    }

    // Expression update based on opcode.
    const charId = artifact.charId || artifactId;
    const exprState = getExprState(charId);
    const exprKey = resolveExpression(opcode, payload);
    setTargetExpression(exprState, exprKey);

    // Speaking state.
    artifact.isSpeaking = (opcode === "SPEAK");

    // Particle emission on EMOTE/GESTURE with emotion.
    if (opcode === "EMOTE" || opcode === "GESTURE") {
      const emotion = typeof payload.emotion === "string" ? payload.emotion
        : typeof payload.gesture === "string" ? payload.gesture : "";
      if (emotion) {
        // Emit particles above character.
        particles.emit(emotion, artifact.x, artifact.y - SLOT_H * 0.9);
      }
    }

    // Lerp speed overrides.
    artifact.lerpSpeed = opcode === "BARGE_IN" ? 8.0
      : opcode === "ENTER" || opcode === "EXIT" ? 2.5
      : opcode === "MOVE" ? 3.5 : 4.0;

    // Position updates.
    if (opcode === "SCENE_OPEN") {
      artifact.targetY = 395;
      artifact.isSpeaking = false;
    }

    if (opcode === "NARRATE") {
      artifact.targetY = 387;
      artifact.isSpeaking = false;
    }

    if (opcode === "SPEAK") {
      artifact.targetY = 381;
      // Show speech bubble above this character (non-narrator roles only).
      const { role, text } = payload;
      if (role && role !== "narrator") {
        const currentMood = moodEngine.getCurrentMood?.() || "normal";
        speechBubbles.setSpeechBubble(role, text || "", currentMood);
      }
    }

    if (opcode === "BARGE_IN") {
      artifact.targetY = 379;
      artifact.targetX = clamp(artifact.x + artifact.direction * 16, 90, (canvas?.width ?? 720) - 90);
      artifact.direction *= -1;
    }

    if (opcode === "SCENE_CLOSE") {
      artifact.targetY = 403;
      artifact.isSpeaking = false;
      speechBubbles.clearAll();
      transition?.curtainClose();
    }

    if (opcode === "ENTER") {
      const from = payload.from === "right" ? "offscreen_right" : "offscreen_left";
      const to = payload.to ?? "center";
      artifact.x = STAGE_ZONES[from] ?? -80;
      artifact.targetX = STAGE_ZONES[to] ?? STAGE_ZONES.center;
      artifact.targetY = 395;
      artifact.direction = from === "offscreen_right" ? -1 : 1;
      // Trigger entry squash/stretch animation.
      artifact.enterTime = performance.now();
    }

    if (opcode === "EXIT") {
      const to = payload.to === "right" ? "offscreen_right" : "offscreen_left";
      artifact.targetX = STAGE_ZONES[to] ?? -80;
      artifact.isSpeaking = false;
      speechBubbles.clearSpeechBubble(charId);
    }

    if (opcode === "MOVE") {
      const to = payload.to ?? "center";
      artifact.targetX = STAGE_ZONES[to] ?? artifact.x;
      const dx = artifact.targetX - artifact.x;
      if (Math.abs(dx) > 10) {
        artifact.direction = dx > 0 ? 1 : -1;
      }
    }

    if (opcode === "MOOD") {
      moodEngine.setMood(payload.mood || "neutral");
    }
  };

  // ─── State Reset ──────────────────────────────────────────────────────────

  const resetState = () => {
    state.beat = 0;
    state.artifacts = {};
    camera?.reset();
    particles.reset();
    screenEffects?.reset();
    spotlight.reset();
    moodEngine.reset();
    drawStage();
  };

  const stop = () => {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    reset() {
      stop();
      stopAnimation();
      frames = [];
      frameIndex = 0;
      state.backdropImage = null;
      state.characterPortraits = new Map();
      state.expressionStates = new Map();
      state.portraitVersions = new Map();
      state.caption = null;
      if (state.captionTimer) {
        clearTimeout(state.captionTimer);
        state.captionTimer = null;
      }
      speechBubbles.clearAll();
      resetState();
      // Show curtain fully closed before play starts — theatrical reveal when backdrop arrives.
      transition?.showCurtain();
    },

    loadFrames(nextFrames) {
      stop();
      frames = [...nextFrames];
      frameIndex = 0;
      resetState();
    },

    setStyle(style) {
      state.stageLook = createStageLook(typeof style === "string" ? style : "leather-shadow");
      drawStage();
    },

    setArtifactVisuals(nextArtifactVisualsById) {
      // Legacy compatibility — not used in cinematic mode but kept for casting studio.
      state.artifactVisualsById = isRecord(nextArtifactVisualsById) ? nextArtifactVisualsById : {};
      drawStage();
    },

    /**
     * Register an AI-generated character portrait.
     * Applies background removal and stores as expression "neutral".
     *
     * @param {string} charId - Character identifier.
     * @param {string} imageUrl - Portrait URL or data URI.
     * @param {object|undefined} _parts - Ignored (legacy articulated parts path — removed).
     * @param {object|undefined} expressions - Optional pre-generated expression variants.
     */
    setCharacterPortrait(charId, imageUrl, _parts, expressions) {
      if (!charId || !imageUrl) return;

      const version = (state.portraitVersions.get(charId) ?? 0) + 1;
      state.portraitVersions.set(charId, version);

      const exprState = getExprState(charId);

      const loadAndStore = (url, key) => {
        if (!url) return;

        // Skip bg removal for SVG/stub placeholders.
        if (url.includes("/generated/")) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            if (state.portraitVersions.get(charId) !== version) return;
            addExpression(exprState, key, img);
            drawStage();
          };
          img.src = url;
          return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (state.portraitVersions.get(charId) !== version) return;
          const cutout = removeBackground(img);
          addExpression(exprState, key, cutout);
          drawStage();
        };
        img.onerror = () => drawStage();
        img.src = url;
      };

      // Load neutral first.
      loadAndStore(imageUrl, "neutral");

      // Load any pre-generated expression variants.
      if (expressions) {
        for (const [key, url] of Object.entries(expressions)) {
          if (key !== "neutral" && url) {
            loadAndStore(url, key);
          }
        }
      }
    },

    /**
     * Hot-add an expression variant to an existing character.
     * Called when character_expression_update arrives during play.
     *
     * @param {string} charId - Character identifier.
     * @param {string} expressionKey - "happy" | "angry" | "sad".
     * @param {string} imageUrl - Expression portrait URL.
     */
    addExpressionVariant(charId, expressionKey, imageUrl) {
      if (!charId || !expressionKey || !imageUrl) return;
      const exprState = getExprState(charId);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const cutout = removeBackground(img);
        addExpression(exprState, expressionKey, cutout);
        drawStage();
      };
      img.onerror = () => {};
      img.src = imageUrl;
    },

    /**
     * Set AI-generated backdrop image URL.
     */
    setBackdrop(imageUrl) {
      if (!imageUrl) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (transition) {
          if (transition.isFullyClosed()) {
            // Curtain already closed from reset() — set backdrop and open directly.
            state.backdropImage = img;
            transition.curtainOpen();
          } else {
            // Mid-play scene change — close, swap backdrop, open.
            transition.curtainClose(() => {
              state.backdropImage = img;
              transition.curtainOpen();
            });
          }
        } else {
          state.backdropImage = img;
          drawStage();
        }
      };
      img.onerror = () => { state.backdropImage = null; };
      img.src = imageUrl;
    },

    /**
     * Show a caption overlay.
     */
    setCaption(text, speaker) {
      if (state.captionTimer) {
        clearTimeout(state.captionTimer);
        state.captionTimer = null;
      }

      if (!text) {
        state.caption = null;
        drawStage();
        return;
      }

      state.caption = { text, speaker };
      drawStage();

      const wordCount = text.trim().split(/\s+/).length;
      const displayMs = Math.min(Math.max(wordCount * 400, 2000), 8000);
      state.captionTimer = setTimeout(() => {
        state.caption = null;
        state.captionTimer = null;
        drawStage();
      }, displayMs);
    },

    play(onFrame) {
      if (timerId !== null || frames.length === 0) return;

      startAnimation();

      timerId = setInterval(() => {
        if (frameIndex >= frames.length) {
          stop();
          return;
        }

        const frame = frames[frameIndex];
        frameIndex += 1;
        applyFrame(frame);
        onFrame?.(frame, frameIndex, frames.length);
      }, 500);
    },

    pause() {
      stop();
      stopAnimation();
    },

    renderFrame(frame) {
      stop();
      applyFrame(frame);
      startAnimation();
    },

    setMood(mood) {
      moodEngine.setMood(mood);
    },

    /**
     * Directly show a speech bubble above a character (for external callers).
     *
     * @param {string} charId - Character identifier.
     * @param {string} text - Text to display.
     * @param {string} [emotion="neutral"] - Emotion key affecting bubble shape.
     */
    setSpeechBubble(charId, text, emotion) {
      speechBubbles.setSpeechBubble(charId, text, emotion);
    }
  };
};
