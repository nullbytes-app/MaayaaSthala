# Cinematic Storytelling Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Story AI from a static puppet slideshow into an immersive, competition-level interactive storytelling experience with expressive per-character voices, comic speech bubbles, mood-reactive cinematic effects, and audio-visual sync.

**Architecture:** Four pillars built incrementally: (1) Cinematic Stage — character life, mood engine, atmospheric particles; (2) Expressive Voices — AI-directed voice casting with Google Cloud TTS; (3) Comic Speech Bubbles — emotion-based bubble shapes with typewriter animation; (4) Audio-Visual Sync — Web Audio AnalyserNode connecting voice to visual movement.

**Tech Stack:** Vanilla HTML5 Canvas 2D (no new rendering libraries), Google Cloud TTS with SSML, Web Audio API, Google Fonts (Bangers, Patrick Hand, Comic Neue, Architects Daughter).

**Design Doc:** `docs/plans/2026-02-28-cinematic-storytelling-design.md`

---

## Task 1: Desynchronized Idle Sway + Ground Shadows

**Files:**
- Modify: `apps/story-viewer/web/expressionEngine.js:189-272` (drawCharacter function)
- Test: Manual visual inspection in browser (canvas animation — no unit test harness for visual rendering)

**Step 1: Add per-character idle sway rotation**

In `drawCharacter()` at line 207, the current breathing code is:
```javascript
const breathe = Math.sin(beat * 0.5) * 0.012;
```

After this line (before the `ctx.scale` at ~line 215), add idle sway rotation with per-character phase offset:

```javascript
// Idle sway — desynchronized per character using charId hash
const swayPhase = state.charId ? state.charId.charCodeAt(0) * 0.7 : 0;
const idleSway = Math.sin(beat * 0.3 + swayPhase) * 0.015; // ±0.015 radians
ctx.rotate(idleSway);
```

**Step 2: Add ground shadow beneath each character**

In `drawCharacter()`, BEFORE the character image is drawn (before the `ctx.save()` that sets up the character transform, around line 200), add a ground shadow:

```javascript
// Ground shadow — radial gradient ellipse at character's feet
const shadowCenterX = slotX + slotW / 2;
const shadowCenterY = slotY; // feet position
const shadowRadiusX = slotW * 0.35;
const shadowRadiusY = 8;
ctx.save();
ctx.beginPath();
ctx.ellipse(shadowCenterX, shadowCenterY, shadowRadiusX, shadowRadiusY, 0, 0, Math.PI * 2);
const shadowGrad = ctx.createRadialGradient(
  shadowCenterX, shadowCenterY, 0,
  shadowCenterX, shadowCenterY, shadowRadiusX
);
shadowGrad.addColorStop(0, "rgba(0,0,0,0.25)");
shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
ctx.fillStyle = shadowGrad;
ctx.fill();
ctx.restore();
```

**Step 3: Verify visually**

Run: `pnpm dev` (or however the dev server starts)
Open the viewer, start a story. Verify:
- Each character sways at a slightly different rhythm
- A soft shadow ellipse appears beneath each character's feet
- Characters no longer feel like they're floating

**Step 4: Commit**

```bash
git add apps/story-viewer/web/expressionEngine.js
git commit -m "feat: desynchronized idle sway and ground shadows for characters"
```

---

## Task 2: Head/Body Split Drawing for Speaking Bob

**Files:**
- Modify: `apps/story-viewer/web/expressionEngine.js:189-272` (drawCharacter function)

**Step 1: Split character drawing into head and body regions**

In `drawCharacter()`, find the main `ctx.drawImage()` call that draws the character portrait (around line 240-250). Replace it with a two-part draw that separates the head (top 40%) from the body (bottom 60%):

```javascript
// Head/body split for speaking bob
const headFraction = 0.40;
const bodyFraction = 0.60;
const headSrcH = Math.floor(imgH * headFraction);
const bodySrcH = imgH - headSrcH;
const headDrawH = Math.floor(drawH * headFraction);
const bodyDrawH = drawH - headDrawH;

// Speaking head bob — sinusoidal nod when speaking
const headBob = state.isSpeaking ? Math.sin(beat * 3) * 1.5 : 0;

// Draw body (bottom 60%) — stays still
ctx.drawImage(
  activeCanvas,
  0, headSrcH, imgW, bodySrcH,
  drawX, drawY + headDrawH, drawW, bodyDrawH
);

// Draw head (top 40%) — bobs when speaking
ctx.drawImage(
  activeCanvas,
  0, 0, imgW, headSrcH,
  drawX, drawY + headBob, drawW, headDrawH
);
```

Note: `activeCanvas` is the current expression canvas from the crossfade system. `imgW`/`imgH` are the source image dimensions. `drawX`/`drawY`/`drawW`/`drawH` are the computed draw coordinates.

**Step 2: Ensure `isSpeaking` state is properly tracked**

Check that `state.isSpeaking` is being set. It's currently used for the speaking pulse at line 211. If it's not being set externally, look at how `stageRenderer.js` handles SPEAK opcodes (line 449-460 in applyFrame) — it should set `isSpeaking = true` on the artifact when a SPEAK beat fires for that character, and `isSpeaking = false` when the beat ends.

**Step 3: Verify visually**

Start a story. When a character speaks, their head should gently bob up and down (~1.5px amplitude at 3x beat frequency). The body should remain still. There should be NO visible seam between head and body at the split line.

**Step 4: Commit**

```bash
git add apps/story-viewer/web/expressionEngine.js
git commit -m "feat: head/body split drawing with speaking head bob"
```

---

## Task 3: Emotion Pop on Expression Change

**Files:**
- Modify: `apps/story-viewer/web/expressionEngine.js:105-110` (setTargetExpression), `189-272` (drawCharacter)

**Step 1: Track expression change for pop animation**

In `createExpressionState()` (line 60), add a pop animation tracker:

```javascript
emotionPop: 0, // counts down from 1.0 when expression changes
```

In `setTargetExpression()` (line 105), when a new expression is set, trigger the pop:

```javascript
if (key !== state.currentKey) {
  state.emotionPop = 1.0; // trigger pop animation
  // ... existing crossfade logic
}
```

**Step 2: Apply squash-stretch in drawCharacter**

After the breathing scale is applied but before drawing, add the emotion pop effect:

```javascript
// Emotion pop — squash-stretch on expression change
if (state.emotionPop > 0) {
  const popProgress = 1.0 - state.emotionPop;
  const popScale = 1.0 + easeOutBack(popProgress) * 0.08 - 0.08; // overshoot then settle
  const popSquash = 1.0 / popScale; // conservation of volume
  ctx.scale(popSquash, popScale);
  state.emotionPop = Math.max(0, state.emotionPop - dt * 4); // decay over ~250ms
}
```

**Step 3: Verify visually**

Trigger an EMOTE command for a character. The character should briefly scale up (~8% taller, narrower) then spring back to normal size over ~250ms.

**Step 4: Commit**

```bash
git add apps/story-viewer/web/expressionEngine.js
git commit -m "feat: emotion pop squash-stretch on expression changes"
```

---

## Task 4: Walk Cycle Physics During MOVE

**Files:**
- Modify: `apps/story-viewer/web/stageRenderer.js:194-205` (interpolateArtifacts)
- Modify: `apps/story-viewer/web/expressionEngine.js:189-272` (drawCharacter)

**Step 1: Track movement state in artifacts**

In `interpolateArtifacts()` (line 194 of stageRenderer.js), after the lerp logic, add a `isMoving` flag:

```javascript
// After position interpolation
const dx = Math.abs(art.x - art.targetX);
art.isMoving = dx > 2; // moving if more than 2px from target
```

**Step 2: Apply walk cycle in drawCharacter**

Pass `isMoving` as a parameter to `drawCharacter()`. In the drawing function, add walk physics:

```javascript
// Walk cycle — bob + lean when moving
if (isMoving) {
  const walkFreq = beat * 4;
  const walkBob = Math.abs(Math.sin(walkFreq)) * 4; // up-down bob
  const walkLean = Math.sin(walkFreq) * 0.03; // side-to-side lean
  ctx.translate(0, -walkBob);
  ctx.rotate(walkLean);
}
```

**Step 3: Verify visually**

Issue a MOVE command. The character should bob up and down and lean side-to-side as they translate to the new position, stopping smoothly when they arrive.

**Step 4: Commit**

```bash
git add apps/story-viewer/web/expressionEngine.js apps/story-viewer/web/stageRenderer.js
git commit -m "feat: walk cycle bob and lean during character MOVE"
```

---

## Task 5: Mood Engine Module

**Files:**
- Create: `apps/story-viewer/web/moodEngine.js`
- Modify: `apps/story-viewer/web/stageRenderer.js:260-317` (drawStage — integrate mood)
- Modify: `apps/story-viewer/web/main.js:160-202` (route mood_change events)

**Step 1: Create moodEngine.js**

```javascript
/**
 * Mood Engine — translates story mood tags into cinematic effect presets.
 * Receives mood events from playCompiler and configures lighting, particles,
 * camera, and character behavior accordingly.
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

export function createMoodEngine() {
  let currentMood = "neutral";
  let targetPreset = MOOD_PRESETS.neutral;
  let transitionProgress = 1.0; // 1.0 = fully transitioned

  function setMood(mood) {
    if (mood === currentMood) return;
    const preset = MOOD_PRESETS[mood] || MOOD_PRESETS.neutral;
    currentMood = mood;
    targetPreset = preset;
    transitionProgress = 0;
  }

  function update(dt) {
    if (transitionProgress < 1.0) {
      transitionProgress = Math.min(1.0, transitionProgress + dt / 0.8); // 800ms transition
    }
  }

  function getPreset() {
    return targetPreset;
  }

  function getTransitionProgress() {
    return transitionProgress;
  }

  function getCurrentMood() {
    return currentMood;
  }

  function reset() {
    currentMood = "neutral";
    targetPreset = MOOD_PRESETS.neutral;
    transitionProgress = 1.0;
  }

  return { setMood, update, getPreset, getTransitionProgress, getCurrentMood, reset };
}
```

**Step 2: Integrate into stageRenderer.js**

In `createStageRenderer()` (line 209), import and create the mood engine:

```javascript
import { createMoodEngine } from "./moodEngine.js";
```

Inside the factory function, create the instance:
```javascript
const moodEngine = createMoodEngine();
```

In `drawStage()` (line 260), call `moodEngine.update(dt)` and use the preset to configure screen effects and particles.

In `applyFrame()`, handle a new `MOOD` opcode that calls `moodEngine.setMood(payload.mood)`.

**Step 3: Route mood events in main.js**

In the `onAgentMessage` handler (line 160), add handling for `mood_change` message type:

```javascript
if (message.type === "mood_change") {
  chatRenderer?.applyFrame?.({ opcode: "MOOD", payload: { mood: message.mood } });
  studioRenderer?.applyFrame?.({ opcode: "MOOD", payload: { mood: message.mood } });
}
```

**Step 4: Verify visually**

Manually test by adding a mood_change event. Verify lighting overlay transitions smoothly over 800ms.

**Step 5: Commit**

```bash
git add apps/story-viewer/web/moodEngine.js apps/story-viewer/web/stageRenderer.js apps/story-viewer/web/main.js
git commit -m "feat: mood engine with cinematic lighting, particle, and camera presets"
```

---

## Task 6: Atmospheric Particle Presets

**Files:**
- Modify: `apps/story-viewer/web/cinematicEffects.js:260-335` (particle system)

**Step 1: Add continuous emitter mode to particle system**

The current `createParticleSystem()` only supports burst emission via `emit(emotion, x, y)`. Add a continuous emitter:

```javascript
let continuousType = null;
let continuousTimer = 0;

function setContinuous(type) {
  continuousType = type;
  continuousTimer = 0;
}

function clearContinuous() {
  continuousType = null;
}
```

**Step 2: Define 6 atmospheric presets**

Add preset configurations inside the particle system:

```javascript
const ATMOSPHERIC_PRESETS = {
  fireflies: {
    interval: 0.4, color: "#ffdd44", size: [3, 6], life: [3, 5],
    speed: [5, 15], gravity: -2, shape: "circle", alphaOscillate: true,
    spawnArea: "full" // spawn across entire canvas
  },
  dust_motes: {
    interval: 0.3, color: "#ffffff", size: [1, 3], life: [4, 7],
    speed: [3, 8], gravity: -5, shape: "circle", alphaOscillate: false,
    spawnArea: "full"
  },
  rain: {
    interval: 0.05, color: "#aaccff", size: [1, 2], life: [0.5, 1.0],
    speed: [200, 300], gravity: 400, shape: "streak", alphaOscillate: false,
    spawnArea: "top"
  },
  sparkles: {
    interval: 0.15, color: "#ffeeaa", size: [2, 5], life: [0.5, 1.5],
    speed: [20, 50], gravity: -10, shape: "star4", alphaOscillate: true,
    spawnArea: "full"
  },
  snow: {
    interval: 0.12, color: "#ffffff", size: [2, 5], life: [3, 6],
    speed: [10, 30], gravity: 20, shape: "circle", alphaOscillate: false,
    spawnArea: "top"
  },
  leaves: {
    interval: 0.3, color: "#88aa44", size: [4, 8], life: [3, 5],
    speed: [15, 40], gravity: 15, shape: "leaf", alphaOscillate: false,
    spawnArea: "top"
  }
};
```

**Step 3: Update the `update(dt)` function to handle continuous emission**

```javascript
function update(dt) {
  // Continuous emitter
  if (continuousType && ATMOSPHERIC_PRESETS[continuousType]) {
    const preset = ATMOSPHERIC_PRESETS[continuousType];
    continuousTimer += dt;
    while (continuousTimer >= preset.interval && particles.length < 50) {
      continuousTimer -= preset.interval;
      // Spawn particle based on preset config
      const spawnX = preset.spawnArea === "top"
        ? Math.random() * canvasW
        : Math.random() * canvasW;
      const spawnY = preset.spawnArea === "top"
        ? -10
        : Math.random() * canvasH;
      // Create particle with preset properties...
      particles.push(createAtmosphericParticle(preset, spawnX, spawnY));
    }
  }
  // Existing particle update logic...
}
```

**Step 4: Connect to mood engine**

In `stageRenderer.js`, when mood changes, call `particles.setContinuous(moodPreset.particles)` or `particles.clearContinuous()` if null.

**Step 5: Verify visually**

Test each preset type. Verify particle counts stay under 50, animations are smooth, and particles are visually appropriate for their scene type.

**Step 6: Commit**

```bash
git add apps/story-viewer/web/cinematicEffects.js apps/story-viewer/web/stageRenderer.js
git commit -m "feat: 6 atmospheric particle presets with continuous emitter mode"
```

---

## Task 7: Ken Burns Effect on Backdrops

**Files:**
- Modify: `apps/story-viewer/web/stageRenderer.js:96-122` (drawBackdrop function)

**Step 1: Add slow zoom+pan state to backdrop drawing**

In the `drawBackdrop()` function, add Ken Burns animation:

```javascript
// Ken Burns — slow zoom and pan on static backdrops
const kenBurnsSpeed = 0.015; // very slow
const kbZoom = 1.0 + Math.sin(beat * kenBurnsSpeed) * 0.04; // 1.0 to 1.08
const kbPanX = Math.sin(beat * kenBurnsSpeed * 0.7) * 10; // ±10px horizontal drift
const kbPanY = Math.cos(beat * kenBurnsSpeed * 0.5) * 5;  // ±5px vertical drift

ctx.save();
ctx.translate(canvas.width / 2 + kbPanX, canvas.height / 2 + kbPanY);
ctx.scale(kbZoom, kbZoom);
ctx.translate(-canvas.width / 2, -canvas.height / 2);
// existing drawImage call for backdrop
ctx.restore();
```

Note: `beat` is the animation time counter already tracked in the render loop.

**Step 2: Verify visually**

Load a story with a backdrop. The background should slowly drift and zoom almost imperceptibly, creating visual life without distracting from the characters.

**Step 3: Commit**

```bash
git add apps/story-viewer/web/stageRenderer.js
git commit -m "feat: Ken Burns slow zoom and pan on backdrop images"
```

---

## Task 8: Iris Wipe Scene Transition

**Files:**
- Modify: `apps/story-viewer/web/sceneTransition.js:172-207` (draw function), add new method

**Step 1: Add irisWipe method**

After the `fadeToBlack()` method (line 231), add:

```javascript
function irisWipe(onDone) {
  current = {
    type: "iris_close",
    start: performance.now(),
    duration: TRANSITION_DURATION_MS,
    cb: () => {
      // After close, open with new scene
      current = {
        type: "iris_open",
        start: performance.now(),
        duration: TRANSITION_DURATION_MS,
        cb: onDone || null
      };
    }
  };
}
```

**Step 2: Add iris rendering in draw()**

In the `draw()` function (line 172), add handling for `iris_close` and `iris_open` types:

```javascript
if (current.type === "iris_close" || current.type === "iris_open") {
  const maxRadius = Math.hypot(canvas.width, canvas.height) / 2;
  let radius;
  if (current.type === "iris_close") {
    radius = maxRadius * (1 - progress); // shrinks to center
  } else {
    radius = maxRadius * progress; // expands from center
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.arc(canvas.width / 2, canvas.height / 2, Math.max(radius, 0.5), 0, Math.PI * 2, true);
  ctx.clip();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
```

**Step 3: Export the new method**

Add `irisWipe` to the return object of `createSceneTransition()`.

**Step 4: Verify visually**

Test the iris wipe. A black circle should contract to the center, then expand to reveal the new scene.

**Step 5: Commit**

```bash
git add apps/story-viewer/web/sceneTransition.js
git commit -m "feat: iris wipe scene transition effect"
```

---

## Task 9: AI-Directed Voice Casting — Backend

**Files:**
- Modify: `services/conversation-agent/src/tools/audioNarrator.ts:90-136` (voice config)
- Modify: `services/conversation-agent/src/tools/playCompiler.ts:445-481` (SPEAK handling)
- Modify: `services/conversation-agent/src/prompts.ts:177-199` (NatyaScript instructions)
- Modify: `services/conversation-agent/src/types.ts` (add VoiceCasting type)

**Step 1: Write test for voice casting lookup**

Create test file:
```
services/conversation-agent/tests/voiceCasting.spec.ts
```

```typescript
import { describe, it, expect } from "vitest";
import { resolveVoiceConfig, DEFAULT_VOICE_PALETTE } from "../src/tools/audioNarrator";

describe("Voice Casting", () => {
  const casting = {
    narrator: { voice: "en-IN-Neural2-A", rate: 0.85, pitch: -1.0 },
    Meera: { voice: "en-IN-Neural2-B", rate: 1.0, pitch: 1.5 },
    Raja: { voice: "en-IN-Neural2-D", rate: 1.1, pitch: 0.0 }
  };

  it("resolves known character voice from casting", () => {
    const config = resolveVoiceConfig("Meera", casting);
    expect(config.voiceName).toBe("en-IN-Neural2-B");
    expect(config.speakingRate).toBe(1.0);
    expect(config.pitch).toBe(1.5);
  });

  it("falls back to default character voice for unknown characters", () => {
    const config = resolveVoiceConfig("UnknownChar", casting);
    expect(config.voiceName).toBe("en-IN-Neural2-D"); // default character voice
  });

  it("returns narrator voice for narrator role", () => {
    const config = resolveVoiceConfig("narrator", casting);
    expect(config.voiceName).toBe("en-IN-Neural2-A");
    expect(config.speakingRate).toBe(0.85);
  });

  it("works with empty casting (backwards compatible)", () => {
    const config = resolveVoiceConfig("AnyChar", {});
    expect(config.voiceName).toBeDefined();
    expect(config.speakingRate).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run services/conversation-agent/tests/voiceCasting.spec.ts`
Expected: FAIL — `resolveVoiceConfig` not exported

**Step 3: Implement voice casting in audioNarrator.ts**

Add the voice palette and resolver:

```typescript
export const DEFAULT_VOICE_PALETTE = {
  "en-IN": [
    { id: "en-IN-Neural2-A", gender: "female", quality: "warm" },
    { id: "en-IN-Neural2-B", gender: "female", quality: "soft" },
    { id: "en-IN-Neural2-C", gender: "male", quality: "deep" },
    { id: "en-IN-Neural2-D", gender: "male", quality: "bright" },
  ],
  "hi-IN": [
    { id: "hi-IN-Neural2-A", gender: "female", quality: "warm" },
    { id: "hi-IN-Neural2-B", gender: "female", quality: "soft" },
    { id: "hi-IN-Neural2-C", gender: "male", quality: "deep" },
    { id: "hi-IN-Neural2-D", gender: "male", quality: "bright" },
  ],
};

export interface VoiceCastEntry {
  voice: string;
  rate: number;
  pitch: number;
}

export type VoiceCasting = Record<string, VoiceCastEntry>;

export function resolveVoiceConfig(
  speaker: string,
  casting: VoiceCasting
): { voiceName: string; speakingRate: number; pitch: number } {
  const entry = casting[speaker];
  if (entry) {
    return { voiceName: entry.voice, speakingRate: entry.rate, pitch: entry.pitch };
  }
  // Fallback defaults
  if (speaker === "narrator") {
    return { voiceName: "en-IN-Neural2-A", speakingRate: 0.85, pitch: -1.0 };
  }
  return { voiceName: "en-IN-Neural2-D", speakingRate: 1.0, pitch: 0.0 };
}
```

**Step 4: Update narrateText() signature**

Change `narrateText` to accept speaker name + casting instead of just voiceType:

```typescript
export async function narrateText(
  text: string,
  beatNumber?: number,
  options?: NarrationOptions & {
    speaker?: string;
    voiceCasting?: VoiceCasting;
  }
): Promise<NarrationResult> {
  const speaker = options?.speaker || (options?.voiceType === "narrator" ? "narrator" : "character");
  const casting = options?.voiceCasting || {};
  const voiceConfig = resolveVoiceConfig(speaker, casting);
  // Use voiceConfig.voiceName, .speakingRate, .pitch in the GCP call
  // ...
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run services/conversation-agent/tests/voiceCasting.spec.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add services/conversation-agent/src/tools/audioNarrator.ts services/conversation-agent/tests/voiceCasting.spec.ts
git commit -m "feat: per-character voice casting with Google TTS voice palette"
```

---

## Task 10: Voice Casting in Play Compiler

**Files:**
- Modify: `services/conversation-agent/src/tools/playCompiler.ts:445-481` (SPEAK handler)
- Modify: `services/conversation-agent/src/tools/playCompiler.ts:401-441` (NARRATE handler)

**Step 1: Accept voiceCasting in compileAndRunPlay**

Add `voiceCasting` to the function's options:

```typescript
export async function compileAndRunPlay(
  input: PlayCompilerInput,
  options: PlayCompilerOptions & { voiceCasting?: VoiceCasting }
): Promise<void> {
```

**Step 2: Pass speaker + casting to narrateText calls**

In the NARRATE handler (~line 417), change:
```typescript
const narration = await narrateText(text, beat, {
  voiceType: "narrator",
  speaker: "narrator",
  voiceCasting: options.voiceCasting || {},
  gcpProject: options.gcpProject,
  // ...
});
```

In the SPEAK handler (~line 458), change:
```typescript
const role = payload.role || "character";
const narration = await narrateText(text, beat, {
  voiceType: "character",
  speaker: role,
  voiceCasting: options.voiceCasting || {},
  gcpProject: options.gcpProject,
  // ...
});
```

**Step 3: Emit voiceCasting from agent's compile_and_run_play tool call**

The conversation agent needs to include `voiceCasting` when calling `compile_and_run_play`. This is handled in the agent's tool definition — add voiceCasting as an optional parameter.

**Step 4: Verify end-to-end**

Start a story. Each character should now use a different voice from the Neural2 palette. The narrator should sound distinct from all characters.

**Step 5: Commit**

```bash
git add services/conversation-agent/src/tools/playCompiler.ts
git commit -m "feat: pass per-character voice casting through play compiler to TTS"
```

---

## Task 11: Voice Casting Prompt Instructions

**Files:**
- Modify: `services/conversation-agent/src/prompts.ts:177-199` (NatyaScript section)

**Step 1: Add voice casting instructions to the agent prompt**

In the NatyaScript instructions section, add guidance for the AI to generate voice casting:

```typescript
// Add to the system prompt, in the compile_and_run_play tool description:
`When calling compile_and_run_play, include a voiceCasting object that assigns
each character a distinct voice from the available palette:

Available voices:
- en-IN-Neural2-A: Female, warm and clear (best for narrators, mothers, gentle characters)
- en-IN-Neural2-B: Female, soft and nurturing (best for young girls, gentle characters)
- en-IN-Neural2-C: Male, deep and authoritative (best for elders, villains, kings)
- en-IN-Neural2-D: Male, bright and energetic (best for boys, heroes, comic characters)

Voice casting example:
{
  "narrator": { "voice": "en-IN-Neural2-A", "rate": 0.85, "pitch": -1.0 },
  "Meera": { "voice": "en-IN-Neural2-B", "rate": 1.0, "pitch": 1.5 },
  "Raja": { "voice": "en-IN-Neural2-D", "rate": 1.1, "pitch": 0.0 },
  "Grandmother": { "voice": "en-IN-Neural2-A", "rate": 0.8, "pitch": -1.5 },
  "Tiger": { "voice": "en-IN-Neural2-C", "rate": 0.75, "pitch": -3.0 }
}

Guidelines:
- Match voice gender to character gender
- Use pitch to differentiate age: higher for children (+1 to +3), lower for elders (-1 to -3)
- Use rate to convey personality: faster for energetic (1.1-1.2), slower for wise (0.75-0.85)
- Narrator always uses Neural2-A with rate 0.85 and pitch -1.0`
```

**Step 2: Add mood tagging instructions**

Add to the NatyaScript opcode list:

```
MOOD mood=<joyful|tense|scary|peaceful|dramatic|sad>
```

Add to the rules:
```
- Include MOOD before scenes or when the emotional tone shifts
- Valid moods: joyful, tense, scary, peaceful, dramatic, sad
```

**Step 3: Commit**

```bash
git add services/conversation-agent/src/prompts.ts
git commit -m "feat: voice casting and mood tagging instructions in agent prompt"
```

---

## Task 12: Parse MOOD Opcode in NatyaScript Compiler

**Files:**
- Modify: `apps/story-runtime/src/natyaCompiler.ts:68-83` (opcode mapping)
- Test: `apps/story-runtime/tests/natya-compiler.spec.ts`

**Step 1: Write failing test**

```typescript
it("parses MOOD opcode", () => {
  const script = `@1 SCENE_OPEN scene=forest setting=dark forest
@2 MOOD mood=scary
@3 NARRATE text=The shadows grew longer storyState=invocation`;

  const result = compileNatyaScript({ script, storyId: "test", resolvedArtifactId: "a1", roleArtifactIds: {} });
  const moodCmd = result.find(c => c.opcode === "MOOD");
  expect(moodCmd).toBeDefined();
  expect(moodCmd!.payload.mood).toBe("scary");
  expect(moodCmd!.lane).toBe("control");
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run apps/story-runtime/tests/natya-compiler.spec.ts -t "MOOD"`
Expected: FAIL

**Step 3: Add MOOD to opcode mapping**

In `natyaCompiler.ts` line ~68, add to the lane mapping:

```typescript
MOOD: "control",
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run apps/story-runtime/tests/natya-compiler.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/story-runtime/src/natyaCompiler.ts apps/story-runtime/tests/natya-compiler.spec.ts
git commit -m "feat: parse MOOD opcode in NatyaScript compiler"
```

---

## Task 13: Mood Events in Play Compiler

**Files:**
- Modify: `services/conversation-agent/src/tools/playCompiler.ts` (add MOOD handler in the beat loop)

**Step 1: Handle MOOD opcode in the beat processing loop**

In the beat processing switch/if chain in `compileAndRunPlay()` (around lines 389-513), add:

```typescript
if (opcode === "MOOD") {
  const mood = payload.mood || "neutral";
  emitMessage({ type: "mood_change", mood });
  continue; // no delay needed for mood changes
}
```

**Step 2: Verify end-to-end**

Add a `@N MOOD mood=scary` line to a test script. Verify the `mood_change` message is emitted via WebSocket.

**Step 3: Commit**

```bash
git add services/conversation-agent/src/tools/playCompiler.ts
git commit -m "feat: emit mood_change events from play compiler"
```

---

## Task 14: Comic Speech Bubble Module

**Files:**
- Create: `apps/story-viewer/web/speechBubble.js`

**Step 1: Create the speech bubble module**

This is the largest new module (~200 lines). Key components:

```javascript
/**
 * Comic speech bubble system for Story AI stage.
 * Renders emotion-based bubble shapes with typewriter text animation
 * and spring pop-in/out effects.
 */

// Bubble shape renderers
function drawRoundedBubble(ctx, x, y, w, h, tailX, tailY) { /* ... */ }
function drawShoutBubble(ctx, x, y, w, h, tailX, tailY) { /* ... */ }
function drawThoughtBubble(ctx, x, y, w, h, tailX, tailY) { /* ... */ }
function drawWhisperBubble(ctx, x, y, w, h, tailX, tailY) { /* ... */ }

// Text wrapping
function wrapText(ctx, text, maxWidth) { /* returns string[] */ }

// Animation state
class BubbleState {
  constructor() {
    this.scale = 0;       // pop-in animation
    this.opacity = 0;
    this.textProgress = 0; // typewriter 0..1
    this.active = false;
  }
}

// Main export
export function createSpeechBubbleSystem() {
  const bubbles = new Map(); // charId → { text, emotion, state, textCache }

  function setSpeechBubble(charId, text, emotion = "neutral") { /* ... */ }
  function clearSpeechBubble(charId) { /* ... */ }
  function clearAll() { /* ... */ }
  function update(dt) { /* advance animations */ }
  function draw(ctx, artifacts, canvas) { /* render all active bubbles */ }

  return { setSpeechBubble, clearSpeechBubble, clearAll, update, draw };
}
```

Implement the full module with:
- 4 bubble shape functions (rounded, shout, thought, whisper)
- Emotion→shape mapping: anger/excited→shout, fear/whisper→whisper, thinking→thought, default→rounded
- Text wrapping with `ctx.measureText()`
- Offscreen canvas text caching (re-render only when text changes)
- Spring pop-in: `scale += (1 - scale) * Math.min(1, dt * 8)`
- Typewriter: `textProgress += dt * 30 / textLength`
- Auto-positioning: above character, clamped to canvas bounds, collision avoidance
- Tail: quadratic bezier curve pointing to character's mouth area

**Step 2: Verify the module loads without errors**

Import it in stageRenderer.js, create an instance, confirm no console errors.

**Step 3: Commit**

```bash
git add apps/story-viewer/web/speechBubble.js
git commit -m "feat: comic speech bubble module with emotion shapes and typewriter animation"
```

---

## Task 15: Integrate Speech Bubbles into Stage Renderer

**Files:**
- Modify: `apps/story-viewer/web/stageRenderer.js:260-317` (drawStage — add bubble drawing)
- Modify: `apps/story-viewer/web/stageRenderer.js:427-513` (applyFrame — route SPEAK to bubbles)
- Modify: `apps/story-viewer/web/stageRenderer.js:687-709` (setCaption — split dialogue vs narration)

**Step 1: Import and create speech bubble system**

At the top of stageRenderer.js, add:
```javascript
import { createSpeechBubbleSystem } from "./speechBubble.js";
```

Inside `createStageRenderer()`, create the instance:
```javascript
const speechBubbles = createSpeechBubbleSystem();
```

**Step 2: Update draw order in drawStage()**

After drawing characters (line ~306) but BEFORE `camera.restoreTransform()` (line ~309):

```javascript
// Draw speech bubbles (inside camera transform so they shake/zoom with scene)
speechBubbles.update(dt);
speechBubbles.draw(ctx, state.artifacts, canvas);
```

**Step 3: Route SPEAK opcodes to speech bubbles**

In `applyFrame()` where SPEAK is handled (line ~449-460), add:

```javascript
case "SPEAK":
  // ... existing logic
  speechBubbles.setSpeechBubble(payload.role, payload.text, currentMood);
  // Clear after estimated duration
  const speakDuration = Math.max(payload.text.length * 50, 2000);
  setTimeout(() => speechBubbles.clearSpeechBubble(payload.role), speakDuration);
  break;
```

**Step 4: Redesign narration caption**

Modify `drawCaption()` (line 126) to render narration at the TOP of the canvas with a gold border and comic font, while dialogue goes through speech bubbles instead.

**Step 5: Clear bubbles on scene transitions**

In `reset()` (line 537), add: `speechBubbles.clearAll();`

**Step 6: Verify visually**

Start a story. Character dialogue should appear in comic-style speech bubbles above each character. Narration should appear in a caption box at the top of the canvas.

**Step 7: Commit**

```bash
git add apps/story-viewer/web/stageRenderer.js
git commit -m "feat: integrate speech bubbles into stage renderer draw pipeline"
```

---

## Task 16: Load Google Fonts

**Files:**
- Modify: `apps/story-viewer/web/index.html:1-10` (head section)

**Step 1: Add Google Fonts preconnect and stylesheet**

In the `<head>` section of index.html, add:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Patrick+Hand&family=Comic+Neue:wght@400;700&family=Architects+Daughter&display=swap" rel="stylesheet">
```

**Step 2: Commit**

```bash
git add apps/story-viewer/web/index.html
git commit -m "feat: load comic fonts from Google Fonts for speech bubbles"
```

---

## Task 17: Route SPEAK to Bubbles in main.js

**Files:**
- Modify: `apps/story-viewer/web/main.js:188-202` (SPEAK/NARRATE routing)

**Step 1: Route dialogue to speech bubbles instead of bottom caption**

In the `onAgentMessage` handler, where SPEAK/NARRATE text messages are processed (lines 188-202):

For SPEAK beats, instead of calling `setCaption()`, call a new method that routes to speech bubbles:

```javascript
// SPEAK — show as comic speech bubble above character
if (text.startsWith('"') && text.endsWith('"')) {
  const clean = text.slice(1, -1);
  chatRenderer?.setSpeechBubble?.(message.speaker || "unknown", clean, message.mood || "neutral");
  studioRenderer?.setSpeechBubble?.(message.speaker || "unknown", clean, message.mood || "neutral");
}
// NARRATE — show as top-of-canvas caption
else if (text.startsWith('*') && text.endsWith('*')) {
  const clean = text.slice(1, -1);
  chatRenderer?.setCaption?.(clean, "Narrator");
  studioRenderer?.setCaption?.(clean, "Narrator");
}
```

**Step 2: Pass speaker identity in text messages from playCompiler**

In `playCompiler.ts`, when emitting SPEAK text messages (~line 448), include the speaker role:

```typescript
emitMessage({
  type: "text",
  text: `"${text}"`,
  speaker: payload.role, // character name
  mood: currentMood
});
```

**Step 3: Verify end-to-end**

Start a story. Dialogue should appear in speech bubbles. Narration should appear in top caption. No more bottom subtitle for character speech.

**Step 4: Commit**

```bash
git add apps/story-viewer/web/main.js services/conversation-agent/src/tools/playCompiler.ts
git commit -m "feat: route character dialogue to speech bubbles, narration to top caption"
```

---

## Task 18: Audio-Visual Sync Module

**Files:**
- Create: `apps/story-viewer/web/audioSync.js`
- Modify: `apps/story-viewer/web/main.js:139-157` (audio playback)

**Step 1: Create audioSync.js**

```javascript
/**
 * Audio-Visual Sync — uses Web Audio API AnalyserNode to extract
 * real-time amplitude from TTS audio for driving character animations.
 */
export function createAudioSync() {
  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
  let speakIntensity = 0;
  let activeSpeaker = null;

  function connectAudio(audioElement, speakerCharId) {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    try {
      const source = audioCtx.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      activeSpeaker = speakerCharId;
    } catch (e) {
      // MediaElementSource can only be created once per element
      console.warn("AudioSync: could not connect", e.message);
    }
  }

  function update() {
    if (!analyser || !activeSpeaker) {
      speakIntensity = 0;
      return;
    }
    analyser.getByteFrequencyData(dataArray);
    // Average amplitude in speech frequency range (bins 10-100 ≈ 300-3000Hz)
    const speechBins = dataArray.slice(10, 100);
    const avg = speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
    speakIntensity = Math.min(avg / 128, 1.0);
  }

  function getSpeakIntensity() {
    return speakIntensity;
  }

  function getActiveSpeaker() {
    return activeSpeaker;
  }

  function disconnect() {
    activeSpeaker = null;
    speakIntensity = 0;
  }

  return { connectAudio, update, getSpeakIntensity, getActiveSpeaker, disconnect };
}
```

**Step 2: Integrate into audio playback**

In `main.js` where audio elements are created for TTS playback (the `renderAudio` function in chatPanel.js, lines 132-160), connect the audio element to the sync module:

```javascript
audioSync.connectAudio(audioElement, speakerCharId);
audioElement.onended = () => audioSync.disconnect();
```

**Step 3: Feed speakIntensity to expressionEngine**

In the render loop, pass `audioSync.getSpeakIntensity()` and `audioSync.getActiveSpeaker()` to the expression engine, which uses it to modulate speaking bob magnitude.

**Step 4: Verify**

Play a story. When a character speaks, their head bob and body pulse should match the amplitude of their voice — louder passages cause bigger movements.

**Step 5: Commit**

```bash
git add apps/story-viewer/web/audioSync.js apps/story-viewer/web/main.js
git commit -m "feat: Web Audio AnalyserNode for audio-driven character animation"
```

---

## Task 19: SSML Enhancement for Emotional Delivery

**Files:**
- Modify: `services/conversation-agent/src/tools/audioNarrator.ts:90-136` (callGoogleCloudTts)

**Step 1: Write test for SSML generation**

```typescript
import { buildSSML } from "../src/tools/audioNarrator";

describe("SSML Builder", () => {
  it("wraps text with prosody for whispering", () => {
    const ssml = buildSSML("Be very quiet", "whisper");
    expect(ssml).toContain('<prosody volume="soft" rate="slow">');
  });

  it("adds emphasis for shouting", () => {
    const ssml = buildSSML("Watch out!", "shout");
    expect(ssml).toContain('<prosody volume="loud" rate="fast" pitch="+2st">');
  });

  it("returns plain speak wrapper for neutral", () => {
    const ssml = buildSSML("Hello there", "neutral");
    expect(ssml).toContain("<speak>");
    expect(ssml).not.toContain("<prosody");
  });

  it("adds break for dramatic pause markers", () => {
    const ssml = buildSSML("And then... silence", "dramatic");
    expect(ssml).toContain('<break time="400ms"/>');
  });
});
```

**Step 2: Implement buildSSML function**

```typescript
export function buildSSML(text: string, emotionHint?: string): string {
  let inner = text;

  // Replace ... with dramatic pauses
  inner = inner.replace(/\.\.\./g, '<break time="400ms"/>');

  // Emotion-based prosody wrapping
  switch (emotionHint) {
    case "whisper":
      inner = `<prosody volume="soft" rate="slow">${inner}</prosody>`;
      break;
    case "shout":
      inner = `<prosody volume="loud" rate="fast" pitch="+2st">${inner}</prosody>`;
      break;
    case "excited":
      inner = `<prosody rate="fast" pitch="+1st">${inner}</prosody>`;
      break;
    case "sad":
      inner = `<prosody rate="slow" pitch="-1st">${inner}</prosody>`;
      break;
    case "dramatic":
      // Already handled ... → break above
      inner = `<prosody rate="slow">${inner}</prosody>`;
      break;
    default:
      // neutral — no wrapping
      break;
  }

  return `<speak>${inner}</speak>`;
}
```

**Step 3: Use SSML in callGoogleCloudTts**

Change the `input` field in the TTS request from `{ text }` to `{ ssml: buildSSML(text, emotionHint) }`.

**Step 4: Run tests**

Run: `npx vitest run services/conversation-agent/tests/voiceCasting.spec.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add services/conversation-agent/src/tools/audioNarrator.ts services/conversation-agent/tests/voiceCasting.spec.ts
git commit -m "feat: SSML emotional prosody for TTS delivery"
```

---

## Task 20: Integration Testing & Polish

**Files:**
- All modified files
- Modify: `apps/story-viewer/web/stageRenderer.js` (integrate mood engine into drawStage fully)

**Step 1: Wire mood engine into screen effects**

In `drawStage()`, after `moodEngine.update(dt)`, apply the mood preset:

```javascript
const moodPreset = moodEngine.getPreset();
if (moodPreset.lighting.type) {
  screenEffects.setEffect(moodPreset.lighting.type, moodPreset.lighting.intensity);
}
if (moodPreset.particles) {
  particles.setContinuous(moodPreset.particles);
} else {
  particles.clearContinuous();
}
if (moodPreset.camera.shakeIntensity > 0) {
  camera.shake(moodPreset.camera.shakeIntensity);
}
```

**Step 2: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass. No regressions.

**Step 3: End-to-end visual testing**

Start the full system (`pnpm dev`), create a story, and verify:
1. Characters have unique voices (different Neural2 variants)
2. Characters sway independently with ground shadows
3. Heads bob when speaking
4. Speech bubbles appear above speaking characters
5. Narration appears in a top caption box
6. Mood changes cause lighting/particle transitions
7. Atmospheric particles match scene type
8. Walk cycle animation during MOVE
9. Ken Burns effect on backdrops
10. Iris wipe on scene transitions

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete cinematic storytelling overhaul — voices, bubbles, mood, particles"
```

---

## Execution Order Summary

| Task | Pillar | Dependency | Effort |
|------|--------|------------|--------|
| 1. Idle sway + shadows | Stage | None | Low |
| 2. Head/body split | Stage | None | Low |
| 3. Emotion pop | Stage | None | Low |
| 4. Walk cycle | Stage | None | Low |
| 5. Mood engine | Stage | None | Medium |
| 6. Atmospheric particles | Stage | Task 5 | Medium |
| 7. Ken Burns | Stage | None | Low |
| 8. Iris wipe | Stage | None | Low |
| 9. Voice casting backend | Voice | None | Medium |
| 10. Voice casting in compiler | Voice | Task 9 | Low |
| 11. Voice casting prompts | Voice | Task 10 | Low |
| 12. MOOD opcode parsing | Stage | None | Low |
| 13. Mood events in compiler | Stage | Tasks 5, 12 | Low |
| 14. Speech bubble module | Bubbles | None | Medium |
| 15. Integrate bubbles | Bubbles | Task 14 | Medium |
| 16. Google Fonts | Bubbles | None | Low |
| 17. Route SPEAK to bubbles | Bubbles | Tasks 14, 15 | Low |
| 18. Audio sync module | Sync | None | Medium |
| 19. SSML emotional delivery | Voice | Task 9 | Low |
| 20. Integration testing | All | All above | Medium |

**Parallel tracks possible:**
- Tasks 1-4 + 7-8 (Stage character life) can run in parallel with Tasks 9-11 (Voice) and Tasks 14-16 (Bubbles)
- Task 18 (Audio sync) is independent until integration
