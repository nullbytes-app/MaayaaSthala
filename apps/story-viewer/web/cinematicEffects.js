/**
 * cinematicEffects.js — Camera system, particle effects, screen overlays, and spotlight.
 *
 * Research basis:
 *   - AniME / FilmAgent: director agents select shot types based on emotional content
 *   - Disney 12 principles: staging, follow-through, slow-in/slow-out
 *   - Style Bible: max 0.15 alpha for overlays, shake decays in 500ms, max 30 particles
 */

import { easeInOutCubic, easeOutBack } from "./expressionEngine.js";

// ─── Camera System ────────────────────────────────────────────────────────────

/**
 * Create a cinematic camera for the stage canvas.
 * Handles zoom (shot type), smooth pan to target, and shake decay.
 *
 * @param {number} canvasW - Canvas width.
 * @param {number} canvasH - Canvas height.
 * @returns {object} Camera controller.
 */
export const createCamera = (canvasW, canvasH) => {
  // Current and target camera state.
  const state = {
    // Zoom level: 1.0 = normal, 1.15 = close-up, 1.05 = medium, 0.95 = wide.
    zoom: 1.0,
    targetZoom: 1.0,
    // Pan offset in canvas pixels (translation applied after zoom).
    panX: 0,
    panY: 0,
    targetPanX: 0,
    targetPanY: 0,
    // Shake — decays by 0.88/frame (dead in ~500ms at 60fps).
    shakeIntensity: 0,
    shakeX: 0,
    shakeY: 0
  };

  // Shot type → zoom multiplier mapping.
  const SHOT_ZOOM = {
    close_up: 1.15,
    medium: 1.05,
    wide: 0.95,
    establishing: 1.0   // zoom out then back to 1.0 — establishing uses tween to normal
  };

  // Stage center (default target when no character is specified).
  const centerX = canvasW / 2;
  const centerY = canvasH * 0.55; // slightly below center for theatrical framing

  return {
    /**
     * Direct camera to focus on a position with a given shot type.
     *
     * @param {number} targetX - Target X position in canvas coordinates (character center).
     * @param {number} targetY - Target Y position in canvas coordinates (character center).
     * @param {string} shotType - "close_up" | "medium" | "wide" | "establishing".
     */
    focusOn(targetX, targetY, shotType) {
      const zoom = SHOT_ZOOM[shotType] ?? 1.0;
      state.targetZoom = zoom;

      if (shotType === "establishing" || shotType === "wide" || !targetX) {
        // Wide/establishing: center the stage.
        state.targetPanX = 0;
        state.targetPanY = 0;
      } else {
        // Pan toward character: offset so the character is near center.
        // At zoom=1.15, shift the viewport so character is at center.
        const offsetX = (centerX - targetX) * (zoom - 1.0) * 0.5;
        const offsetY = (centerY - targetY) * (zoom - 1.0) * 0.3;
        state.targetPanX = offsetX;
        state.targetPanY = offsetY;
      }
    },

    /**
     * Apply camera shake.
     *
     * @param {number} intensity - Shake magnitude in pixels (0–20 reasonable range).
     */
    shake(intensity) {
      state.shakeIntensity = Math.min(intensity, 20);
    },

    /**
     * Update camera interpolation and shake decay. Call every frame.
     *
     * @param {number} dt - Elapsed time in seconds.
     */
    update(dt) {
      // Smooth zoom and pan lerp (easeInOutCubic approximated via lerp with factor).
      const lerpFactor = Math.min(1, dt * 3.5); // ~3.5 units/sec interpolation
      state.zoom += (state.targetZoom - state.zoom) * lerpFactor;
      state.panX += (state.targetPanX - state.panX) * lerpFactor;
      state.panY += (state.targetPanY - state.panY) * lerpFactor;

      // Shake decay: 0.88 per frame at 60fps ≈ half-life ~500ms.
      if (state.shakeIntensity > 0.1) {
        state.shakeIntensity *= Math.pow(0.88, dt * 60);
        state.shakeX = (Math.random() * 2 - 1) * state.shakeIntensity;
        state.shakeY = (Math.random() * 2 - 1) * state.shakeIntensity;
      } else {
        state.shakeIntensity = 0;
        state.shakeX = 0;
        state.shakeY = 0;
      }
    },

    /**
     * Apply camera transform to context. Call before drawing stage content.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context.
     */
    applyTransform(ctx) {
      ctx.save();
      const z = state.zoom;
      // Zoom about canvas center.
      ctx.translate(canvasW / 2 + state.panX + state.shakeX, canvasH / 2 + state.panY + state.shakeY);
      ctx.scale(z, z);
      ctx.translate(-canvasW / 2, -canvasH / 2);
    },

    /**
     * Restore context after camera transform.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context.
     */
    restoreTransform(ctx) {
      ctx.restore();
    },

    /** Reset to default state (wide shot, no shake). */
    reset() {
      state.zoom = 1.0;
      state.targetZoom = 1.0;
      state.panX = 0;
      state.panY = 0;
      state.targetPanX = 0;
      state.targetPanY = 0;
      state.shakeIntensity = 0;
    }
  };
};

// ─── Particle System ─────────────────────────────────────────────────────────

// Particle shape drawing functions (no emoji — pre-rendered simple shapes at 60fps).
const drawStar4 = (ctx, x, y, r, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const radius = i % 2 === 0 ? r : r * 0.4;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
};

const drawDrop = (ctx, x, y, r, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.3, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x - r * 0.5, y + r * 0.2);
  ctx.lineTo(x + r * 0.5, y + r * 0.2);
  ctx.closePath();
  ctx.fill();
};

const drawCross = (ctx, x, y, r, color) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
};

const drawBolt = (ctx, x, y, r, color) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.3, y - r);
  ctx.lineTo(x - r * 0.1, y);
  ctx.lineTo(x + r * 0.2, y);
  ctx.lineTo(x - r * 0.3, y + r);
  ctx.lineTo(x + r * 0.1, y * 0 + y);
  ctx.lineTo(x - r * 0.2, y);
  ctx.lineTo(x + r * 0.3, y - r);
  ctx.closePath();
  ctx.fill();
};

const drawLeaf = (ctx, x, y, r, color, angle) => {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.4, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawPetal = (ctx, x, y, r, color, angle) => {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.5, r * 0.3, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const SHAPE_DRAWERS = {
  star4: (ctx, p) => drawStar4(ctx, 0, 0, p.radius, p.color),
  drop: (ctx, p) => drawDrop(ctx, 0, 0, p.radius, p.color),
  cross: (ctx, p) => drawCross(ctx, 0, 0, p.radius, p.color),
  bolt: (ctx, p) => drawBolt(ctx, 0, 0, p.radius, p.color),
  leaf: (ctx, p) => drawLeaf(ctx, 0, 0, p.radius, p.color, p.rotation),
  petal: (ctx, p) => drawPetal(ctx, 0, 0, p.radius, p.color, p.rotation),
  // Fallback circle for atmospheric presets (dust_motes, snow, fireflies).
  circle: (ctx, p) => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
};

// Particle presets — emit on EMOTE trigger, not continuously.
const PARTICLE_PRESETS = {
  sparkles: { shape: "star4",  color: "#FFD700", count: 10, lifetimeSec: 1.5, gravity: -20 },
  tears:    { shape: "drop",   color: "#4FC3F7", count: 5,  lifetimeSec: 1.8, gravity: 40 },
  anger:    { shape: "cross",  color: "#F44336", count: 5,  lifetimeSec: 1.2, gravity: -10 },
  storm:    { shape: "bolt",   color: "#FFC107", count: 4,  lifetimeSec: 0.8, gravity: 0 },
  leaves:   { shape: "leaf",   color: "#8BC34A", count: 8,  lifetimeSec: 3.0, gravity: 15 },
  flowers:  { shape: "petal",  color: "#E91E63", count: 7,  lifetimeSec: 2.5, gravity: -5 }
};

// Map EMOTE/GESTURE emotion → particle preset.
const EMOTION_TO_PARTICLES = {
  joyful: "sparkles",
  happy:  "sparkles",
  dance:  "sparkles",
  sad:    "tears",
  angry:  "anger",
  fight:  "anger",
  fearful: "storm",
  surprised: "storm"
};

/**
 * Create a particle system.
 *
 * @returns {object} Particle system controller.
 */
export const createParticleSystem = () => {
  const MAX_PARTICLES = 30;
  let particles = [];

  // ─── Continuous Atmospheric Emitter ─────────────────────────────────────────

  const CANVAS_W = 720;
  const CANVAS_H = 420;

  const ATMOSPHERIC_PRESETS = {
    fireflies: {
      interval: 0.4, colors: ["#ffdd44", "#ffee88", "#ffffaa"], sizeRange: [3, 6],
      lifeRange: [3, 5], speedRange: [5, 15], gravity: -2, shape: "circle",
      alphaOscillate: true, spawnArea: "full"
    },
    dust_motes: {
      interval: 0.3, colors: ["#ffffff", "#eeeeee"], sizeRange: [1, 3],
      lifeRange: [4, 7], speedRange: [3, 8], gravity: -3, shape: "circle",
      alphaOscillate: false, spawnArea: "full"
    },
    rain: {
      interval: 0.05, colors: ["#aaccff", "#88aadd"], sizeRange: [1, 2],
      lifeRange: [0.5, 1.0], speedRange: [200, 300], gravity: 400, shape: "drop",
      alphaOscillate: false, spawnArea: "top"
    },
    sparkles: {
      interval: 0.15, colors: ["#ffeeaa", "#ffddff", "#aaddff"], sizeRange: [2, 5],
      lifeRange: [0.5, 1.5], speedRange: [20, 50], gravity: -10, shape: "star4",
      alphaOscillate: true, spawnArea: "full"
    },
    snow: {
      interval: 0.12, colors: ["#ffffff", "#eeeeff"], sizeRange: [2, 5],
      lifeRange: [3, 6], speedRange: [10, 30], gravity: 20, shape: "circle",
      alphaOscillate: false, spawnArea: "top"
    },
    leaves: {
      interval: 0.3, colors: ["#88aa44", "#669933", "#aa8844"], sizeRange: [4, 8],
      lifeRange: [3, 5], speedRange: [15, 40], gravity: 15, shape: "leaf",
      alphaOscillate: false, spawnArea: "top"
    }
  };

  let continuousType = null;
  let continuousTimer = 0;

  /**
   * Return a random float in [min, max).
   *
   * @param {number} min - Lower bound.
   * @param {number} max - Upper bound.
   * @returns {number} Random value.
   */
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Spawn a single atmospheric particle from a preset.
   *
   * @param {object} preset - One of the ATMOSPHERIC_PRESETS entries.
   * @param {number} spawnX - Spawn X in canvas space.
   * @param {number} spawnY - Spawn Y in canvas space.
   * @returns {object} New particle object.
   */
  function createAtmosphericParticle(preset, spawnX, spawnY) {
    const r = rand(preset.sizeRange[0], preset.sizeRange[1]);
    const speed = rand(preset.speedRange[0], preset.speedRange[1]);
    // Reason: rain falls mostly straight down with tiny horizontal drift; all other
    // atmospheric particles drift in a random radial direction.
    const angle = preset.shape === "drop"
      ? Math.PI / 2 + (Math.random() - 0.5) * 0.2
      : Math.random() * Math.PI * 2;
    const color = preset.colors[Math.floor(Math.random() * preset.colors.length)];

    return {
      x: spawnX,
      y: spawnY,
      vx: Math.cos(angle) * speed * (preset.shape === "drop" ? 0.1 : 1),
      vy: Math.sin(angle) * speed * (preset.shape === "drop" ? 0.3 : 1),
      radius: r,
      color,
      shape: preset.shape,
      gravity: preset.gravity,
      lifetimeSec: rand(preset.lifeRange[0], preset.lifeRange[1]),
      age: 0,
      rotation: Math.random() * Math.PI * 2,
      alphaOscillate: preset.alphaOscillate
    };
  }

  return {
    /**
     * Emit particles for an emotion at a position.
     *
     * @param {string} emotion - Emotion key (matches EMOTION_TO_PARTICLES keys).
     * @param {number} x - Spawn X in screen space (character center).
     * @param {number} y - Spawn Y in screen space (character top).
     */
    emit(emotion, x, y) {
      const presetName = EMOTION_TO_PARTICLES[emotion];
      if (!presetName) return;
      const preset = PARTICLE_PRESETS[presetName];
      if (!preset) return;

      const toAdd = Math.min(preset.count, MAX_PARTICLES - particles.length);
      for (let i = 0; i < toAdd; i++) {
        particles.push({
          x: x + (Math.random() - 0.5) * 40,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 60,
          vy: -30 + (Math.random() - 0.5) * 40,
          radius: 4 + Math.random() * 6,
          color: preset.color,
          shape: preset.shape,
          gravity: preset.gravity,
          lifetimeSec: preset.lifetimeSec * (0.7 + Math.random() * 0.6),
          age: 0,
          rotation: Math.random() * Math.PI * 2
        });
      }
    },

    /**
     * Update particle positions and ages. Also ticks the continuous atmospheric emitter.
     *
     * @param {number} dt - Elapsed time in seconds.
     */
    update(dt) {
      // Continuous atmospheric emitter — spawn particles on an interval.
      if (continuousType && ATMOSPHERIC_PRESETS[continuousType]) {
        const preset = ATMOSPHERIC_PRESETS[continuousType];
        continuousTimer += dt;
        while (continuousTimer >= preset.interval && particles.length < MAX_PARTICLES) {
          continuousTimer -= preset.interval;
          const spawnX = preset.spawnArea === "top"
            ? Math.random() * CANVAS_W
            : Math.random() * CANVAS_W;
          const spawnY = preset.spawnArea === "top"
            ? -10
            : Math.random() * CANVAS_H;
          particles.push(createAtmosphericParticle(preset, spawnX, spawnY));
        }
      }

      // Advance all particles.
      particles = particles.filter(p => {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt + 0.5 * p.gravity * dt * dt;
        p.vy += p.gravity * dt;
        p.rotation += dt * 2;
        return p.age < p.lifetimeSec;
      });
    },

    /**
     * Draw all active particles.
     * Atmospheric particles with alphaOscillate=true (fireflies, sparkles) pulse
     * their brightness using a sine wave to mimic natural blinking.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context (screen space — outside camera transform).
     */
    draw(ctx) {
      for (const p of particles) {
        const progress = p.age / p.lifetimeSec;
        let alpha = 1.0 - easeInOutCubic(progress);

        // Reason: fireflies and sparkles should oscillate in brightness rather than
        // fade linearly — a slow sine pulse creates the natural blinking look.
        if (p.alphaOscillate) {
          alpha *= 0.5 + 0.5 * Math.sin(p.age * 4.0 + p.rotation);
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(p.x, p.y);
        const drawer = SHAPE_DRAWERS[p.shape];
        if (drawer) drawer(ctx, p);
        ctx.restore();
      }
    },

    /**
     * Clear all particles and stop any continuous emitter.
     */
    reset() {
      particles = [];
      continuousType = null;
      continuousTimer = 0;
    },

    /**
     * Start continuous atmospheric particle emission.
     * Calling with the same type that is already active is a no-op.
     *
     * @param {string} type - Preset name: fireflies|dust_motes|rain|sparkles|snow|leaves.
     */
    setContinuous(type) {
      if (continuousType === type) return;
      continuousType = type;
      continuousTimer = 0;
    },

    /**
     * Stop continuous atmospheric particle emission.
     * Existing particles continue rendering until their lifetime expires.
     */
    clearContinuous() {
      continuousType = null;
      continuousTimer = 0;
    }
  };
};

// ─── Screen Effects ───────────────────────────────────────────────────────────

/**
 * Create a screen effects controller.
 * Handles color overlays (warmGlow, coldTint, redPulse, vignette, flash).
 * Maximum 1 active overlay per style bible — new effects replace old.
 *
 * @param {number} canvasW - Canvas width.
 * @param {number} canvasH - Canvas height.
 * @returns {object} Screen effects controller.
 */
export const createScreenEffects = (canvasW, canvasH) => {
  let active = null; // { type, intensity, fadeProgress, fadeDurationMs }

  const FADE_DURATION_MS = 600; // fade in over 600ms
  const HOLD_DURATION_MS = 2000; // then hold
  const FADEOUT_DURATION_MS = 1000; // then fade out

  return {
    /**
     * Set an active screen effect.
     *
     * @param {string} effectType - "warmGlow" | "coldTint" | "redPulse" | "vignette" | "flash".
     * @param {number} intensity - 0–1 intensity multiplier.
     */
    setEffect(effectType, intensity) {
      active = {
        type: effectType,
        intensity: Math.min(intensity, 1.0),
        phase: "fade_in",
        elapsed: 0
      };
    },

    /** Update effect timing. */
    update(dt) {
      if (!active) return;
      active.elapsed += dt * 1000;

      if (active.phase === "fade_in" && active.elapsed >= FADE_DURATION_MS) {
        active.phase = "hold";
        active.elapsed = 0;
      } else if (active.phase === "hold" && active.elapsed >= HOLD_DURATION_MS) {
        active.phase = "fade_out";
        active.elapsed = 0;
      } else if (active.phase === "fade_out" && active.elapsed >= FADEOUT_DURATION_MS) {
        active = null;
      }
    },

    /**
     * Draw active screen effect overlay.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context (screen space).
     * @param {number} beat - Beat counter for pulsing effects.
     */
    draw(ctx, beat) {
      if (!active) return;

      // Compute envelope alpha.
      let envelope = 1.0;
      if (active.phase === "fade_in") {
        envelope = easeInOutCubic(Math.min(1, active.elapsed / FADE_DURATION_MS));
      } else if (active.phase === "fade_out") {
        envelope = easeInOutCubic(1 - Math.min(1, active.elapsed / FADEOUT_DURATION_MS));
      }

      // Style Bible: overlays never exceed 0.15 alpha to avoid overpowering dialogue.
      const maxAlpha = 0.15;
      const baseAlpha = active.intensity * envelope * maxAlpha;

      ctx.save();

      switch (active.type) {
        case "warmGlow": {
          ctx.fillStyle = `rgba(255, 200, 80, ${baseAlpha})`;
          ctx.fillRect(0, 0, canvasW, canvasH);
          break;
        }

        case "coldTint": {
          ctx.fillStyle = `rgba(60, 80, 160, ${baseAlpha * 0.8})`;
          ctx.fillRect(0, 0, canvasW, canvasH);
          break;
        }

        case "redPulse": {
          // Pulse at 4Hz.
          const pulse = 0.5 + Math.sin(beat * 4) * 0.5;
          ctx.fillStyle = `rgba(180, 30, 20, ${baseAlpha * pulse})`;
          ctx.fillRect(0, 0, canvasW, canvasH);
          break;
        }

        case "vignette": {
          const gradient = ctx.createRadialGradient(
            canvasW / 2, canvasH / 2, canvasH * 0.2,
            canvasW / 2, canvasH / 2, canvasH * 0.75
          );
          gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
          gradient.addColorStop(1, `rgba(0, 0, 0, ${baseAlpha * 4})`); // vignette can be stronger
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvasW, canvasH);
          break;
        }

        case "flash": {
          // White flash — decays rapidly.
          const flashAlpha = Math.max(0, baseAlpha * 8 * (1 - active.elapsed / 300));
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(flashAlpha, 0.6)})`;
          ctx.fillRect(0, 0, canvasW, canvasH);
          break;
        }
      }

      ctx.restore();
    },

    reset() {
      active = null;
    }
  };
};

// ─── Spotlight System ─────────────────────────────────────────────────────────

/**
 * Create a spotlight controller.
 * Dims non-target characters to 60% alpha; adds subtle radial glow behind target.
 * Smooth transition over 400ms.
 *
 * @returns {object} Spotlight controller.
 */
export const createSpotlight = () => {
  let targetCharId = null;
  let dimOthers = false;

  return {
    /**
     * Set spotlight target.
     *
     * @param {string|null} charId - Character ID to spotlight (null = no spotlight).
     * @param {boolean} dim - Whether to dim non-target characters.
     */
    setTarget(charId, dim) {
      targetCharId = charId || null;
      dimOthers = !!dim;
    },

    /**
     * Get the alpha multiplier for a given character.
     * Returns 1.0 for spotlit character or when spotlight is off.
     * Returns 0.6 for dimmed non-target characters.
     *
     * @param {string} charId - Character ID to check.
     * @returns {number} Alpha multiplier.
     */
    getAlpha(charId) {
      if (!targetCharId || !dimOthers) return 1.0;
      if (charId === targetCharId) return 1.0;
      return 0.6; // Dim others to 60%
    },

    /**
     * Draw radial glow behind the spotlit character.
     * Call this before drawing the character.
     *
     * @param {CanvasRenderingContext2D} ctx - Canvas context.
     * @param {string} charId - Character ID to check.
     * @param {number} x - Character center X.
     * @param {number} y - Character center Y.
     * @param {number} radius - Glow radius.
     */
    drawGlow(ctx, charId, x, y, radius) {
      if (charId !== targetCharId || !targetCharId) return;

      ctx.save();
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255, 240, 180, 0.12)");
      gradient.addColorStop(1, "rgba(255, 240, 180, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    reset() {
      targetCharId = null;
      dimOthers = false;
    }
  };
};
