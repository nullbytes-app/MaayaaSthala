import { compileNatyaScript } from "../../../../apps/story-runtime/src/natyaCompiler.js";
import {
  createMythicState,
  applyMythicCue,
  type MythicCue
} from "../../../../apps/story-runtime/src/mythicEngine.js";
import type { RuntimeStageCommand } from "../../../../apps/story-runtime/src/runtime.js";
import { narrateText } from "./audioNarrator.js";
import { illustrateScene } from "./sceneIllustrator.js";
import type { GeneratedStory, CharacterAsset, AgentStreamMessage } from "../types.js";

type PlayCompilerOptions = {
  /** Called for each stream message as the play progresses. */
  onMessage: (message: AgentStreamMessage) => void;
  /** Delay in ms between beats for pacing (0 = no delay, for tests). */
  beatDelayMs?: number;
  /** GCP project for Vertex AI illustrations. */
  gcpProject?: string;
  gcpLocation?: string;
  /** If true, generate audio narration via Google Cloud TTS. */
  audioEnabled?: boolean;
  /** If true, generate scene images via Vertex AI. */
  imagesEnabled?: boolean;
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
  const imagesEnabled = options.imagesEnabled ?? Boolean(options.gcpProject);

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
  onMessage({
    type: "play_start",
    sceneId: story.storyId,
    storyTitle: story.title
  });

  // Apply MythicEngine and stream each command with multimodal output.
  let mythicState = createMythicState();
  const scriptLines = story.natyaScript
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  // Track which scenes we've already illustrated (avoid duplicates).
  const illustratedScenes = new Set<string>();

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    const scriptLine = scriptLines[i] ?? "";

    // SCENE_OPEN: generate scene illustration.
    if (command.opcode === "SCENE_OPEN" && imagesEnabled) {
      const setting = extractSetting(scriptLine);
      const sceneKey = `${story.storyId}_scene_${command.beat}`;

      if (!illustratedScenes.has(setting)) {
        illustratedScenes.add(setting);
        // Fire-and-forget — don't block the beat stream on image generation.
        illustrateScene(sceneKey, setting, story.tradition, {
          gcpProject: options.gcpProject,
          gcpLocation: options.gcpLocation
        })
          .then((result) => {
            onMessage({
              type: "image",
              url: result.imageUrl,
              caption: result.caption
            });
          })
          .catch(() => {
            // Image generation is non-critical — play continues without it.
          });
      }
    }

    // NARRATE: apply mythic state + emit narration text + audio.
    if (command.opcode === "NARRATE") {
      const { text, cue } = extractNarrateCue(scriptLine, command.beat);
      mythicState = applyMythicCue(mythicState, cue);

      if (text) {
        // Emit narration as text for the chat panel.
        onMessage({ type: "text", content: `*${text}*` });

        // Generate and emit audio (non-blocking — starts immediately).
        if (audioEnabled) {
          narrateText(text, command.beat, { gcpProject: options.gcpProject })
            .then((result) => {
              if (result.source === "google_cloud_tts" && result.audioUrl) {
                onMessage({
                  type: "audio",
                  url: result.audioUrl,
                  duration: result.durationEstimateMs,
                  beatNumber: command.beat
                });
              }
            })
            .catch(() => {
              // Audio is non-critical — play continues without it.
            });
        }
      }
    }

    // SPEAK: emit dialogue as text.
    if (command.opcode === "SPEAK") {
      const text = extractSpeakText(scriptLine);
      if (text) {
        onMessage({ type: "text", content: `"${text}"` });
      }
    }

    // Always emit the stage command for canvas rendering.
    onMessage({ type: "stage_command", command });

    // Emit a play_frame for UI beat tracking / video sync.
    onMessage({ type: "play_frame", beat: command.beat, sceneId: story.storyId });

    if (beatDelayMs > 0) {
      await sleep(beatDelayMs);
    }
  }

  return commands;
};
