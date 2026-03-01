# Cinematic Storytelling Overhaul — Design Document

**Date:** 2026-02-28
**Status:** Approved
**Goal:** Transform Story AI from a static image slideshow into an immersive, competition-level interactive storytelling experience for children.

## Problem Statement

The current system generates AI character portraits and displays them on an HTML5 canvas stage, but:
- Characters blink onto screen with no natural movement — no idle sway, no grounded shadows, no walk animation
- All characters share the same TTS voice (Google Neural2-D) with identical pitch/rate
- Dialogue appears as subtitles in a dark banner at the bottom — not engaging for children
- No emotional connection between story mood and visual presentation
- The visual layer doesn't speak the same emotional language as the story layer

## Solution: Four Pillars

### Pillar 1: Cinematic Stage

Transform the static canvas into a living theatrical stage.

#### 1A. Character Life (expressionEngine.js)

| Feature | Implementation | Visual Effect |
|---|---|---|
| Desynchronized idle sway | Per-character phase offset via `charId.charCodeAt(0)`. Sinusoidal rotation ±0.015 rad around feet anchor | Characters feel independent, not robotic |
| Ground shadow | Radial gradient ellipse beneath each character | Characters grounded on stage, not floating |
| Head/body split | Draw top 40% (head) and bottom 60% (body) separately. Head gets speaking bob offset | Natural head movement during speech |
| Emotion pop | On expression change: squash-stretch (scale 1.08→1.0 in 250ms, easeOutBack) | Cartoon-like reactivity |
| Walk cycle | During MOVE: sinusoidal Y bob + alternating lean rotation | Characters walk instead of sliding |
| Audio-driven intensity | Web Audio AnalyserNode amplitude drives speaking pulse magnitude | Character responds to their own voice |

#### 1B. Mood Engine (new: moodEngine.js ~150 lines)

Each scene/beat carries a mood tag from the AI. The mood engine translates mood into cinematic effects.

| Mood | Lighting Overlay | Particles | Camera | Character Effect |
|---|---|---|---|---|
| `joyful` | Warm gold rgba(255,200,50,0.08) | Sparkles | Slight zoom in | Subtle bounce |
| `tense` | Cool blue rgba(30,60,150,0.10) | None | Slow zoom in | Reduced sway |
| `scary` | Dark rgba(0,0,0,0.15) + red pulse | Wind/dust | Slight shake | Tremble (fast micro-sway) |
| `peaceful` | Soft warm rgba(255,240,200,0.06) | Dust motes | Ken Burns slow pan | Relaxed sway |
| `dramatic` | Vignette + spotlight on speaker | Storm | Push in on speaker | Others dim |
| `sad` | Cool desaturated rgba(100,120,180,0.08) | Rain | Slow pull back | Slight lean down |

Data flow: `prompts.ts` → AI tags `[MOOD: joyful]` → `natyaCompiler.ts` parses → `playCompiler.ts` emits `mood_change` → `moodEngine.js` configures effects.

#### 1C. Atmospheric Particles (cinematicEffects.js)

Six continuous particle presets tied to scene metadata:

| Preset | Count | Behavior | Trigger |
|---|---|---|---|
| `fireflies` | 10-15 | Warm yellow, pulsing alpha, random walk | Forest/garden |
| `dust_motes` | 15-20 | Tiny white, low alpha, float upward | Indoor/palace |
| `rain` | 25-30 | Blue-white streaks, fast fall, wind drift | Storm |
| `sparkles` | 15-20 | Multi-color stars, burst from point | Magic moments |
| `snow` | 20-25 | White, variable size, gentle drift | Winter |
| `leaves` | 10-15 | Brown/green ellipses, drift diagonally | Autumn/wind |

#### 1D. Scene Transitions (sceneTransition.js)

Add iris wipe (circle expanding/contracting from center) for scene changes within acts. Existing curtain and fade-to-black remain.

#### 1E. Ken Burns on Backdrops

Slow zoom (1.0→1.08) + gentle pan on static backdrop images during dialogue. Creates visual interest when background would otherwise be static.

---

### Pillar 2: Expressive Voices

#### AI-Directed Voice Casting

The conversation agent acts as casting director — assigns each character a voice profile from Google TTS voices.

Available palette:
- en-IN: Neural2-A (F, warm), Neural2-B (F, soft), Neural2-C (M, deep), Neural2-D (M, bright)
- hi-IN: Neural2-A (F), Neural2-B (F), Neural2-C (M), Neural2-D (M)

Agent output per story (stored in session):
```json
{
  "voiceCasting": {
    "narrator": { "voice": "en-IN-Neural2-A", "rate": 0.85, "pitch": -1.0 },
    "Meera": { "voice": "en-IN-Neural2-B", "rate": 1.0, "pitch": 1.5 },
    "Raja": { "voice": "en-IN-Neural2-D", "rate": 1.1, "pitch": 0.0 },
    "Grandmother": { "voice": "en-IN-Neural2-A", "rate": 0.8, "pitch": -1.5 },
    "The Tiger": { "voice": "en-IN-Neural2-C", "rate": 0.75, "pitch": -3.0 }
  }
}
```

Flow: Agent knows characters → runs voice casting step → casting stored in session → `playCompiler.ts` passes per-character config → `audioNarrator.ts` uses character-specific voice + SSML.

SSML enhancements per beat: `<emphasis>`, `<break>`, `<prosody>` adjustments for questions, exclamations, whispers.

---

### Pillar 3: Comic Speech Bubbles

New module: `speechBubble.js` (~200 lines)

#### Bubble Types

| Emotion/Context | Shape | Font |
|---|---|---|
| Normal speech | Rounded rectangle + curved bezier tail | Patrick Hand 15px |
| Shouting/Anger | Spiky starburst | Bangers 18px bold, CAPS |
| Whispering/Fear | Dashed outline, thin | Comic Neue 12px italic |
| Thinking | Cloud with circle-chain tail | Comic Neue 14px italic |
| Narration | Rectangle, gold border, no tail (top of canvas) | Architects Daughter 14px |

#### Rendering: Hybrid Canvas

- Bubble shapes on canvas inside camera transform (shake/zoom with scene)
- Text pre-rendered to offscreen canvas, cached until text changes
- Draw order: backdrop → characters → speech bubbles → restore camera → particles → effects

#### Animations

- Pop-in: spring scale 0→1 with easeOutBack (~300ms)
- Typewriter: text reveals at ~30 chars/sec
- Pop-out: scale 1→0 (~150ms)

#### Auto-positioning

- Default: centered above character head, tail → mouth area
- Clamped to canvas bounds (720x420) with 10px margin
- Collision avoidance: shift left/right if bubbles overlap

#### Integration

- SPEAK beats → `speechBubble.setSpeechBubble(charId, text, emotion)`
- NARRATE beats → redesigned top-of-canvas caption
- `stageRenderer.js` calls `update(dt)` and `draw(ctx)` in render loop

Google Fonts: Bangers, Patrick Hand, Comic Neue, Architects Daughter

---

### Pillar 4: Audio-Visual Sync

Connects voice, visuals, and bubbles into a cohesive experience.

#### 4A. Web Audio AnalyserNode

1. TTS audio plays → AudioContext + AnalyserNode created
2. Sample frequency data at 60fps
3. Extract average amplitude in speech range (300-3000Hz)
4. Map to `speakIntensity` (0.0-1.0)
5. Drives: speaking bob magnitude, head micro-rotation, bubble scale pulse

New file: `audioSync.js` (~60 lines)

#### 4B. Synchronized Timeline

Per SPEAK beat:
1. T+0ms: Speech bubble pops in (spring animation)
2. T+0ms: TTS audio begins
3. T+50ms: Typewriter text reveal starts
4. T+0ms→end: AnalyserNode drives character intensity
5. T+end: Audio finishes → bubble pops out → next beat

#### 4C. Mood Transitions

- Lighting: smooth 800ms transition (not instant)
- Particles: fade in/out over 500ms
- Camera: ease in with easeInOutCubic

---

## Files Impact

| File | Changes |
|---|---|
| `expressionEngine.js` | Desync sway, ground shadow, head/body split, emotion pop, walk cycle, audio-driven intensity |
| `cinematicEffects.js` | 6 continuous particle presets, Ken Burns backdrop |
| `sceneTransition.js` | Iris wipe transition |
| `stageRenderer.js` | Mood engine integration, speech bubbles, walk cycle, new draw order |
| `speechBubble.js` (new) | Comic bubble renderer — shapes, typewriter, auto-position |
| `moodEngine.js` (new) | Mood→effects mapping, smooth transitions |
| `audioSync.js` (new) | Web Audio AnalyserNode, speakIntensity |
| `audioNarrator.ts` | Per-character voice config, SSML construction |
| `playCompiler.ts` | Pass voice casting, emit mood events |
| `prompts.ts` | Voice casting + mood tagging instructions |
| `natyaCompiler.ts` | Parse MOOD tags, voice casting metadata |
| `main.js` | Route SPEAK to speech bubbles, integrate audio sync |
| `index.html` | Load Google Fonts |

## Research Sources

- PBS KIDS HTML5 Storybook Engine, Theatre.js, GSAP
- Spine 2D, Live2D Cubism, DragonBones (evaluated, deferred)
- GL Transitions, curtains.js (evaluated, deferred)
- Robotic Tholpavakoothu (Kerala) — traditional puppet animation digitized
- Kamishibai (Japanese paper theater) — frame-based storytelling format
- Google AI Experiments (Blob Opera, Everies) — instant visual feedback patterns
- ALSC Notable Children's Digital Media criteria — multimodal engagement
- ElevenLabs v3 (evaluated, deferred for cost — upgrade path available)
