import { compileNatyaScript } from "../../../../apps/story-runtime/src/natyaCompiler.js";
import {
  createMythicState,
  applyMythicCue,
  type MythicCue
} from "../../../../apps/story-runtime/src/mythicEngine.js";
import type { RuntimeStageCommand } from "../../../../apps/story-runtime/src/runtime.js";
import { narrateText, type VoiceCasting } from "./audioNarrator.js";
import { illustrateScene } from "./sceneIllustrator.js";
import type { GeneratedStory, CharacterAsset, AgentStreamMessage } from "../types.js";

// ─── Cinematic Director Helpers ─────────────────────────────────────────────

/**
 * Create a lightweight director stage command (CAMERA, EFFECT, or SPOTLIGHT).
 * These are not written by the story generator — they are injected by the director
 * at runtime based on emotional context.
 */
const directorCommand = (
  sceneId: string,
  beat: number,
  opcode: string,
  payload: Record<string, unknown>
): RuntimeStageCommand => ({
  version: "1.0",
  eventId: `director_${sceneId}_${beat}_${opcode.toLowerCase()}`,
  sceneId,
  beat,
  lane: "control",
  opcode,
  target: { artifactId: "director" },
  payload
});

/**
 * Inject CAMERA, EFFECT, and SPOTLIGHT directives before a beat.
 * Maps opcode + emotion context to camera shot, screen effect, and spotlight state.
 * Rule-based (no LLM) — fast and predictable.
 */
const buildDirectorDirectives = (
  sceneId: string,
  command: RuntimeStageCommand
): RuntimeStageCommand[] => {
  const directives: RuntimeStageCommand[] = [];
  const { opcode, beat, payload } = command;
  const emotion = typeof payload.emotion === "string" ? payload.emotion.toLowerCase() : "";
  const gesture = typeof payload.gesture === "string" ? payload.gesture.toLowerCase() : "";
  const speakerRole = typeof payload.role === "string" ? payload.role : "";

  // CAMERA directive — shot type based on opcode.
  if (opcode === "SPEAK") {
    directives.push(directorCommand(sceneId, beat, "CAMERA", {
      shot: "close_up",
      target: speakerRole
    }));
  } else if (opcode === "EMOTE") {
    const shake = emotion === "angry" ? 4 : emotion === "surprised" ? 6 : 0;
    directives.push(directorCommand(sceneId, beat, "CAMERA", {
      shot: emotion === "angry" ? "medium" : "close_up",
      target: speakerRole,
      ...(shake > 0 ? { shake } : {})
    }));
  } else if (opcode === "GESTURE") {
    const shake = gesture === "fight" ? 8 : gesture === "angry" ? 4 : 0;
    directives.push(directorCommand(sceneId, beat, "CAMERA", {
      shot: "medium",
      target: speakerRole,
      ...(shake > 0 ? { shake } : {})
    }));
  } else if (opcode === "SCENE_OPEN") {
    directives.push(directorCommand(sceneId, beat, "CAMERA", {
      shot: "establishing",
      target: ""
    }));
  } else if (opcode === "BARGE_IN") {
    directives.push(directorCommand(sceneId, beat, "CAMERA", {
      shot: "close_up",
      target: speakerRole,
      shake: 6
    }));
  } else if (opcode === "SCENE_CLOSE") {
    directives.push(directorCommand(sceneId, beat, "CAMERA", {
      shot: "wide",
      target: ""
    }));
  }

  // EFFECT directive — screen overlay based on emotion.
  if (opcode === "EMOTE" || opcode === "GESTURE") {
    const effectType =
      emotion === "joyful" || gesture === "joyful" ? "warmGlow" :
      emotion === "angry" || gesture === "angry" ? "redPulse" :
      emotion === "sad" || gesture === "sad" ? "coldTint" :
      emotion === "fearful" || gesture === "fearful" ? "coldTint" :
      emotion === "surprised" || gesture === "surprised" ? "flash" :
      null;

    const intensity =
      emotion === "joyful" || gesture === "joyful" ? 0.8 :
      emotion === "angry" || gesture === "angry" ? 1.0 :
      emotion === "sad" || gesture === "sad" ? 0.8 :
      emotion === "fearful" || gesture === "fearful" ? 0.5 :
      emotion === "surprised" || gesture === "surprised" ? 1.0 :
      0;

    if (effectType) {
      directives.push(directorCommand(sceneId, beat, "EFFECT", {
        effectType,
        intensity
      }));
    }
  } else if (opcode === "SCENE_CLOSE") {
    directives.push(directorCommand(sceneId, beat, "EFFECT", {
      effectType: "vignette",
      intensity: 0.8
    }));
  }

  // SPOTLIGHT directive — highlight the active character.
  if ((opcode === "SPEAK" || opcode === "EMOTE") && speakerRole) {
    directives.push(directorCommand(sceneId, beat, "SPOTLIGHT", {
      target: speakerRole,
      dim_others: true
    }));
  } else if (opcode === "SCENE_OPEN" || opcode === "SCENE_CLOSE" || opcode === "NARRATE") {
    // Remove spotlight — no single character highlighted.
    directives.push(directorCommand(sceneId, beat, "SPOTLIGHT", {
      target: "",
      dim_others: false
    }));
  }

  return directives;
};

type PlayCompilerOptions = {
  /** Called for each stream message as the play progresses. */
  onMessage: (message: AgentStreamMessage) => void;
  /** Delay in ms between beats for pacing (0 = no delay, for tests). */
  beatDelayMs?: number;
  /** GCP project for Vertex AI illustrations. */
  gcpProject?: string;
  gcpLocation?: string;
  /** Gemini API key for Gemini image generation fallback. */
  apiKey?: string;
  /** If true, generate audio narration via Google Cloud TTS. */
  audioEnabled?: boolean;
  /** If true, generate scene images via Vertex AI or Gemini. */
  imagesEnabled?: boolean;
  /** AI-generated voice casting map — assigns per-character TTS voices. */
  voiceCasting?: VoiceCasting;
  /**
   * Video production — Phase 5 (deferred, not yet implemented).
   *
   * The "video" AgentStreamMessage type is declared and rendered client-side,
   * but no producer exists here. Planned paths:
   *   A. Client-side MediaRecorder captures canvas animation → local blob URL.
   *   B. Server-side: pass videoArtifactBaseUrl, emit after play completes.
   * Neither is wired; this compiler only emits text/image/audio/stage_command/play_*.
   */
};

type PlayCompilerInput = {
  story: GeneratedStory;
  approvedCharacters: Map<string, CharacterAsset>;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate the beat delay based on opcode and text content.
 * Longer pauses for scene transitions and natural speech pacing for narration.
 *
 * @param opcode - The NatyaScript opcode.
 * @param text - Optional text content for word-count-based timing.
 * @param audioDurationMs - If provided, use this as the authoritative delay (audio-synced).
 * @returns Delay in milliseconds.
 */
export const calculateBeatDelay = (
  opcode: string,
  text?: string,
  audioDurationMs?: number
): number => {
  // Audio duration is the most accurate pacer — use it when available.
  if (audioDurationMs !== undefined && audioDurationMs > 0) {
    return audioDurationMs;
  }

  switch (opcode) {
    case "SCENE_OPEN":
      return 3000; // Dramatic pause for backdrop to load + audience to settle

    case "SCENE_CLOSE":
      return 2000; // Closure beat

    case "NARRATE":
    case "SPEAK": {
      if (!text) return 1200;
      const wordCount = text.trim().split(/\s+/).length;
      // ~150wpm speaking rate = 400ms per word; cap at 8s for long paragraphs
      const estimated = Math.round((wordCount / 150) * 60 * 1000);
      return Math.min(Math.max(estimated, 1200), 8000);
    }

    case "GESTURE":
      return 1500;

    case "MOVE":
    case "ENTER":
    case "EXIT":
      return 1200;

    case "PAUSE":
      return 2000;

    default:
      return 800; // Base delay (up from 300)
  }
};

/**
 * Extract the setting description from a SCENE_OPEN line.
 * Format: @<beat> SCENE_OPEN scene=<name> setting=<description>
 */
const extractSetting = (line: string): string => {
  const settingMatch = line.match(/setting=(.+?)(?:\s+\w+=|$)/);
  return settingMatch?.[1]?.trim() ?? "An Indian puppet theatre stage";
};

/**
 * Extract narration text and MythicCue from a NARRATE line.
 */
const extractNarrateCue = (
  line: string,
  beat: number
): { text: string; cue: MythicCue } => {
  const textMatch = line.match(/text=(.+?)(?:\s+storyState=|\s+oathDelta=|\s+desireDelta=|$)/);
  const stateMatch = line.match(/storyState=(\w+)/);
  const oathMatch = line.match(/oathDelta=(-?\d+)/);
  const desireMatch = line.match(/desireDelta=(-?\d+)/);

  const text = textMatch?.[1]?.trim() ?? "";
  const cue: MythicCue = {
    beat,
    storyState: stateMatch?.[1] as MythicCue["storyState"],
    oathDelta: oathMatch ? Number(oathMatch[1]) : undefined,
    desireDelta: desireMatch ? Number(desireMatch[1]) : undefined
  };

  return { text, cue };
};

/**
 * Extract dialogue text from a SPEAK line.
 * Format: @<beat> SPEAK role=<charId> text=<dialogue>
 */
const extractSpeakText = (line: string): string => {
  const textMatch = line.match(/text=(.+?)$/);
  return textMatch?.[1]?.trim() ?? "";
};

/**
 * Compile a NatyaScript story and stream all 4 modalities:
 * - stage_command: Canvas animation frames
 * - text: Narration text snippets
 * - audio: TTS narration audio (when GCP enabled)
 * - image: Scene illustrations (when GCP enabled)
 * - play_frame: Beat sync markers for UI
 *
 * @param input - Story + approved character map.
 * @param options - Stream callback, timing, and GCP service options.
 * @returns Array of all compiled commands (for testing/logging).
 */
export const compileAndRunPlay = async (
  input: PlayCompilerInput,
  options: PlayCompilerOptions
): Promise<RuntimeStageCommand[]> => {
  const { story, approvedCharacters } = input;
  const { onMessage, beatDelayMs = 300 } = options;
  const audioEnabled = options.audioEnabled ?? Boolean(options.gcpProject);
  const imagesEnabled = options.imagesEnabled ?? Boolean(options.gcpProject || options.apiKey);

  // Build role→artifactId map from approved characters.
  const roleArtifactIds: Record<string, string> = {};
  let primaryArtifactId = "placeholder_artifact";

  for (const [charId, asset] of approvedCharacters) {
    roleArtifactIds[charId] = asset.assetId;
    if (primaryArtifactId === "placeholder_artifact") {
      primaryArtifactId = asset.assetId;
    }
  }

  // Compile NatyaScript → RuntimeStageCommands.
  const commands = compileNatyaScript({
    storyId: story.storyId,
    script: story.natyaScript,
    resolvedArtifactId: primaryArtifactId,
    roleArtifactIds
  });

  // Signal play start to the client.
  // Include audioEnabled so the browser knows whether to expect server TTS audio
  // and can skip browser Web Speech API TTS to avoid dual-voice overlap.
  onMessage({
    type: "play_start",
    sceneId: story.storyId,
    storyTitle: story.title,
    audioEnabled
  });

  // Apply MythicEngine and stream each command with multimodal output.
  let mythicState = createMythicState();
  // Track emotional arc state for pacing — peaks get +1.5s extra delay.
  let currentStoryState = "invocation";
  const scriptLines = story.natyaScript
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  // Kick off all unique scene backdrop generations concurrently (non-blocking).
  // This gives AI providers maximum time while early beats play. Each SCENE_OPEN beat
  // then waits up to 8 seconds for its specific backdrop before proceeding.
  const backdropPromises = new Map<string, Promise<{ imageUrl: string } | null>>();
  if (imagesEnabled) {
    const seenSettings = new Set<string>();
    for (let i = 0; i < commands.length; i++) {
      if (commands[i].opcode === "SCENE_OPEN") {
        const setting = extractSetting(scriptLines[i] ?? "");
        console.log(`[backdrop] SCENE_OPEN at beat ${commands[i].beat}, setting="${setting}", line="${scriptLines[i]?.slice(0, 80)}"`);
        if (!seenSettings.has(setting)) {
          seenSettings.add(setting);
          const sceneKey = `${story.storyId}_scene_${commands[i].beat}`;
          console.log(`[backdrop] Starting generation for "${setting.slice(0, 60)}"`);
          backdropPromises.set(
            setting,
            illustrateScene(sceneKey, setting, story.tradition, {
              gcpProject: options.gcpProject,
              gcpLocation: options.gcpLocation,
              apiKey: options.apiKey
            }).then((r) => { console.log(`[backdrop] Result for "${setting.slice(0, 40)}": source=${r?.source ?? "null"}`); return r; }).catch((e) => { console.log(`[backdrop] Error: ${e}`); return null; })
          );
        }
      }
    }
  }

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const scriptLine = scriptLines[i] ?? "";
    process.stderr.write(`{"event":"beat_started","storyId":"${story.storyId}","beat":${command.beat},"opcode":"${command.opcode}"}\n`);

    // SCENE_OPEN: wait for the in-flight backdrop generation (started before beat loop).
    // Reason: 15s timeout because Gemini image generation takes 7-10s for a full backdrop.
    // Vertex AI and Gemini now race in parallel inside illustrateScene, so Gemini starts
    // at T=0 (not after Vertex AI's 5s timeout). 15s gives comfortable headroom.
    if (command.opcode === "SCENE_OPEN" && imagesEnabled) {
      const setting = extractSetting(scriptLine);
      const sceneKey = `${story.storyId}_scene_${command.beat}`;
      const backdropPromise = backdropPromises.get(setting);
      console.log(`[backdrop] SCENE_OPEN beat ${command.beat}: setting="${setting.slice(0, 50)}", hasPromise=${!!backdropPromise}`);
      if (backdropPromise) {
        const result = await Promise.race([
          backdropPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000))
        ]);
        console.log(`[backdrop] SCENE_OPEN beat ${command.beat}: result=${result ? `source=${(result as any).source}` : "null (timeout or error)"}`);
        if (result && "imageUrl" in result) {
          onMessage({
            type: "scene_backdrop",
            sceneId: sceneKey,
            imageUrl: result.imageUrl,
            setting
          });
        } else {
          // Reason: Gemini sometimes takes >15s (cold start). Register a late-delivery
          // callback so the backdrop still appears mid-scene when it finishes, rather
          // than never showing up. The frontend applies it immediately on receipt.
          backdropPromise.then((lateResult) => {
            if (lateResult && "imageUrl" in lateResult) {
              console.log(`[backdrop] Late delivery for beat ${command.beat}: source=${(lateResult as any).source}`);
              onMessage({
                type: "scene_backdrop",
                sceneId: sceneKey,
                imageUrl: lateResult.imageUrl,
                setting
              });
            }
          }).catch(() => {/* ignore */});
        }
      }
    }

    // Inject cinematic director directives (CAMERA/EFFECT/SPOTLIGHT) before each beat.
    // These are emitted as stage_commands so the frontend can orchestrate camera + effects.
    const directives = buildDirectorDirectives(story.storyId, command);
    for (const directive of directives) {
      onMessage({ type: "stage_command", command: directive });
    }

    // Emotional peak pacing — add +1.5s at story climax and resolution beats.
    const isEmotionalPeak = currentStoryState === "temptation_peak" || currentStoryState === "restoration";
    const peakBonus = isEmotionalPeak && beatDelayMs > 0 ? 1500 : 0;

    // NARRATE: apply mythic state + emit narration text + audio.
    if (command.opcode === "NARRATE") {
      const { text, cue } = extractNarrateCue(scriptLine, command.beat);
      mythicState = applyMythicCue(mythicState, cue);
      // Track story state for emotional peak detection.
      if (cue.storyState) currentStoryState = cue.storyState;

      if (text) {
        // Emit narration as text for the chat panel.
        onMessage({ type: "text", content: `*${text}*` });

        // Always emit stage command and beat marker for NARRATE.
        onMessage({ type: "stage_command", command });
        onMessage({ type: "play_frame", beat: command.beat, sceneId: story.storyId });

        // Await audio so the beat delay can be driven by audio duration.
        if (audioEnabled && beatDelayMs > 0) {
          process.stderr.write(`{"event":"tts_start","storyId":"${story.storyId}","beat":${command.beat},"speaker":"narrator"}\n`);
          // 12s outer timeout covers import + client init + synthesize.
          // The inner 10s timer in callGoogleCloudTts only covers synthesizeSpeech,
          // not TextToSpeechClient instantiation which can hang on Cloud Run cold starts.
          const audioResult = await Promise.race([
            narrateText(text, command.beat, {
              gcpProject: options.gcpProject,
              voiceType: "narrator",
              speaker: "narrator",
              voiceCasting: options.voiceCasting
            }).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000))
          ]);
          if (audioResult === null) {
            process.stderr.write(`{"event":"tts_timeout","storyId":"${story.storyId}","beat":${command.beat},"speaker":"narrator"}\n`);
          } else {
            process.stderr.write(`{"event":"tts_success","storyId":"${story.storyId}","beat":${command.beat},"speaker":"narrator"}\n`);
          }

          if (audioResult?.source === "google_cloud_tts" && audioResult.audioUrl) {
            onMessage({
              type: "audio",
              url: audioResult.audioUrl,
              duration: audioResult.durationEstimateMs,
              beatNumber: command.beat,
              speaker: "narrator"
            });

            // Use audio duration as the authoritative pacer + peak bonus.
            await sleep(audioResult.durationEstimateMs + peakBonus);
            continue;
          }
        }

        // Fallback: text-based timing + peak bonus.
        if (beatDelayMs > 0) {
          await sleep(calculateBeatDelay("NARRATE", text) + peakBonus);
        }
        continue;
      }
    }

    // SPEAK: emit dialogue as text + character voice audio.
    if (command.opcode === "SPEAK") {
      const text = extractSpeakText(scriptLine);
      if (text) {
        onMessage({ type: "text", content: `"${text}"` });
      }

      // Always emit stage command for SPEAK beats.
      onMessage({ type: "stage_command", command });
      onMessage({ type: "play_frame", beat: command.beat, sceneId: story.storyId });

      const speakerCharId = typeof command.payload.role === "string" ? command.payload.role : "character";

      if (text && beatDelayMs > 0) {
        // Await character dialogue audio.
        if (audioEnabled) {
          process.stderr.write(`{"event":"tts_start","storyId":"${story.storyId}","beat":${command.beat},"speaker":"${speakerCharId}"}\n`);
          // 12s outer timeout covers import + client init + synthesize.
          const audioResult = await Promise.race([
            narrateText(text, command.beat, {
              gcpProject: options.gcpProject,
              voiceType: "character",
              speaker: speakerCharId,
              voiceCasting: options.voiceCasting
            }).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000))
          ]);
          if (audioResult === null) {
            process.stderr.write(`{"event":"tts_timeout","storyId":"${story.storyId}","beat":${command.beat},"speaker":"${speakerCharId}"}\n`);
          } else {
            process.stderr.write(`{"event":"tts_success","storyId":"${story.storyId}","beat":${command.beat},"speaker":"${speakerCharId}"}\n`);
          }

          if (audioResult?.source === "google_cloud_tts" && audioResult.audioUrl) {
            onMessage({
              type: "audio",
              url: audioResult.audioUrl,
              duration: audioResult.durationEstimateMs,
              beatNumber: command.beat,
              speaker: speakerCharId
            });

            await sleep(audioResult.durationEstimateMs + peakBonus);
          } else {
            await sleep(calculateBeatDelay("SPEAK", text) + peakBonus);
          }
        } else {
          await sleep(calculateBeatDelay("SPEAK", text) + peakBonus);
        }
      }

      continue;
    }

    // MOOD: emit mood_change event for the frontend mood engine.
    // No delay needed — mood transitions are handled client-side over 800ms.
    if (command.opcode === "MOOD") {
      const mood = typeof command.payload.mood === "string" ? command.payload.mood : "neutral";
      onMessage({ type: "mood_change", mood } as AgentStreamMessage);
      continue; // skip beat delay for MOOD
    }

    // Always emit the stage command for canvas rendering.
    onMessage({ type: "stage_command", command });

    // Emit a play_frame for UI beat tracking / video sync.
    onMessage({ type: "play_frame", beat: command.beat, sceneId: story.storyId });

    // Opcode-aware delay + peak bonus.
    if (beatDelayMs > 0) {
      await sleep(calculateBeatDelay(command.opcode) + peakBonus);
    }
    process.stderr.write(`{"event":"beat_completed","storyId":"${story.storyId}","beat":${command.beat},"opcode":"${command.opcode}"}\n`);
  }

  return commands;
};
