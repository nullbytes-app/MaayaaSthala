/**
 * Mood Engine — translates story mood tags into cinematic effect presets.
 * Receives mood events from playCompiler and configures lighting, particles,
 * camera, and character behavior accordingly.
 *
 * Usage:
 *   const mood = createMoodEngine();
 *   mood.setMood("scary");       // triggers on MOOD opcode
 *   mood.update(dt);             // called each frame
 *   const preset = mood.getPreset();  // read by stageRenderer
 */

const MOOD_PRESETS = {
  joyful: {
    lighting: { type: "warmGlow", intensity: 0.08, color: [255, 200, 50] },
    particles: "sparkles",
    camera: { zoomDelta: 0.02, shakeIntensity: 0 },
    characterMod: { swayMultiplier: 1.3, bounceAmount: 1.5 }
  },
  tense: {
    lighting: { type: "coldTint", intensity: 0.10, color: [30, 60, 150] },
    particles: null,
    camera: { zoomDelta: 0.03, shakeIntensity: 0 },
    characterMod: { swayMultiplier: 0.3, bounceAmount: 0 }
  },
  scary: {
    lighting: { type: "redPulse", intensity: 0.15, color: [0, 0, 0] },
    particles: "dust_motes",
    camera: { zoomDelta: 0, shakeIntensity: 2 },
    characterMod: { swayMultiplier: 3.0, bounceAmount: 0 }
  },
  peaceful: {
    lighting: { type: "warmGlow", intensity: 0.06, color: [255, 240, 200] },
    particles: "dust_motes",
    camera: { zoomDelta: -0.01, shakeIntensity: 0 },
    characterMod: { swayMultiplier: 1.0, bounceAmount: 0 }
  },
  dramatic: {
    lighting: { type: "vignette", intensity: 0.12, color: [0, 0, 0] },
    particles: null,
    camera: { zoomDelta: 0.05, shakeIntensity: 0 },
    characterMod: { swayMultiplier: 0.5, bounceAmount: 0 }
  },
  sad: {
    lighting: { type: "coldTint", intensity: 0.08, color: [100, 120, 180] },
    particles: "rain",
    camera: { zoomDelta: -0.02, shakeIntensity: 0 },
    characterMod: { swayMultiplier: 0.6, bounceAmount: 0 }
  },
  neutral: {
    lighting: { type: null, intensity: 0, color: [0, 0, 0] },
    particles: null,
    camera: { zoomDelta: 0, shakeIntensity: 0 },
    characterMod: { swayMultiplier: 1.0, bounceAmount: 0 }
  }
};

/**
 * Create a mood engine instance.
 *
 * @returns {object} Mood engine with setMood, update, getPreset, getCurrentMood, reset.
 */
export function createMoodEngine() {
  let currentMood = "neutral";
  let targetPreset = MOOD_PRESETS.neutral;
  let transitionProgress = 1.0; // 1.0 = fully transitioned

  /**
   * Set the active mood. Starts an 800ms transition to the new preset.
   *
   * @param {string} mood - Mood key (joyful|tense|scary|peaceful|dramatic|sad|neutral).
   */
  function setMood(mood) {
    if (mood === currentMood) return;
    const preset = MOOD_PRESETS[mood] || MOOD_PRESETS.neutral;
    currentMood = mood;
    targetPreset = preset;
    transitionProgress = 0;
  }

  /**
   * Advance mood transition.
   *
   * @param {number} dt - Elapsed time in seconds.
   */
  function update(dt) {
    if (transitionProgress < 1.0) {
      transitionProgress = Math.min(1.0, transitionProgress + dt / 0.8); // 800ms transition
    }
  }

  /**
   * Get the current mood preset.
   *
   * @returns {object} Mood preset with lighting, particles, camera, characterMod.
   */
  function getPreset() {
    return targetPreset;
  }

  /**
   * Get transition progress (0 = just changed, 1 = fully transitioned).
   *
   * @returns {number} Progress 0.0–1.0.
   */
  function getTransitionProgress() {
    return transitionProgress;
  }

  /**
   * Get the current mood key.
   *
   * @returns {string} Current mood name.
   */
  function getCurrentMood() {
    return currentMood;
  }

  /**
   * Reset to neutral mood instantly.
   */
  function reset() {
    currentMood = "neutral";
    targetPreset = MOOD_PRESETS.neutral;
    transitionProgress = 1.0;
  }

  return { setMood, update, getPreset, getTransitionProgress, getCurrentMood, reset };
}
