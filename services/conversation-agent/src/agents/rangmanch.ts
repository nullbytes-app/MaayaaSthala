import { matchCharactersToLibrary } from "../tools/characterBrowser.js";
import { compileAndRunPlay } from "../tools/playCompiler.js";
import { type VoiceCasting } from "../tools/audioNarrator.js";
import { generateExpressionVariants } from "../providerRouter.js";
import type { ConversationSession, CharacterAsset } from "../types.js";
import type { TheatreAgent, AgentDeps, MessageHandler, RangmanchInput } from "./types.js";

/**
 * Rangmanch (रंगमंच) — the Stage Manager agent.
 *
 * One job: execute the play with synchronized multi-modal streaming.
 * Auto-fills from library if no characters were explicitly approved.
 * Emits character_portrait events before play starts so the viewer can
 * set up articulated puppet rigs.
 *
 * Returns void (streams events through onMessage callback).
 */
export const rangmanch: TheatreAgent<RangmanchInput, void> = {
  name: "Rangmanch",

  async run(
    input: RangmanchInput,
    session: ConversationSession,
    onMessage: MessageHandler,
    deps: AgentDeps
  ): Promise<void> {
    const { story, approvedCharacters } = input;

    let characters = approvedCharacters;

    // Auto-fill from library if no characters were explicitly approved.
    // Reason: allows "let's perform" to work even if the user skipped the casting step.
    if (characters.size === 0) {
      const libraryMatches = matchCharactersToLibrary(story.characters);
      const filledMap = new Map<string, (typeof characters extends Map<string, infer V> ? V : never)>();
      for (const [charId, asset] of libraryMatches) {
        if (asset) {
          filledMap.set(charId, asset);
        }
      }
      characters = filledMap;
    }

    onMessage({
      type: "text",
      content: `The stage is set! Performing "${story.title}" 🎭`
    });
    onMessage({ type: "thinking", stage: "Setting the stage..." });

    try {
      onMessage({ type: "thinking", stage: "" });

      // Emit character_portrait for each approved character before the play starts.
      // Also kick off expression variant generation in parallel (non-blocking) when
      // a Gemini API key is available — variants stream in via character_expression_update.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expressionPromises: Promise<any>[] = [];

      for (const [charId, asset] of characters) {
        onMessage({
          type: "character_portrait",
          charId,
          name: asset.name,
          imageUrl: asset.previewUrl,
          ...(asset.parts ? { parts: asset.parts } : {}),
          ...(asset.expressions ? { expressions: asset.expressions } : {})
        });

        // Generate expression variants in parallel if we have an API key and a real portrait.
        // Only trigger for AI-generated portraits (not SVG/stub placeholders).
        const canGenerateExpressions =
          deps.config.apiKey &&
          asset.previewUrl &&
          !asset.previewUrl.includes("/generated/");

        if (canGenerateExpressions && deps.config.apiKey) {
          // Find the story character for this charId to get the description.
          const storyChar = input.story.characters.find(c => c.charId === charId);
          if (storyChar) {
            const expressionPromise = generateExpressionVariants(
              asset.name,
              asset.archetype,
              storyChar.description,
              asset.previewUrl,
              deps.config.apiKey,
              (key, imageUrl) => {
                // Stream each expression variant as it arrives.
                onMessage({
                  type: "character_expression_update",
                  charId,
                  expressionKey: key,
                  imageUrl
                });
              }
            ).catch(() => {
              // Silent failure — neutral expression always available as fallback.
            });
            expressionPromises.push(expressionPromise);
          }
        }
      }

      // Start play immediately — expression variants arrive during the first beats.
      // No need to await expressionPromises here; they stream via character_expression_update.
      // We do a detached race: if all variants finish before play ends, great; if not, play proceeds.

      // Generate voice casting from story character descriptions so each character
      // receives a gender- and role-appropriate TTS voice.
      // Uses text heuristics on archetype + description to detect:
      //   - female vs male gender → female voices (A/B) or male voices (C/D)
      //   - villain/antagonist → deep male voice with lower pitch
      //   - child → brighter voice with higher pitch and faster rate
      //   - elderly → slower rate, slight pitch adjustment
      //   - narrator → deep authoritative storyteller voice (C)
      const storyCharMap = new Map(
        input.story.characters.map(c => [c.charId, c])
      );

      const castVoice = (charId: string): { voice: string; rate: number; pitch: number } => {
        const sc = storyCharMap.get(charId);
        const tokens = [sc?.archetype ?? "", sc?.description ?? "", sc?.name ?? charId].join(" ").toLowerCase();

        const isFemale = /\b(female|woman|girl|grandmother|mother|sister|aunt|princess|queen|dadi|nani|amma|mata|beti|ladki|she|her)\b/.test(tokens);
        const isVillain = /\b(villain|antagonist|evil|wicked|sinister|dark|corrupt|demon|monster|daaku|rakshak)\b/.test(tokens);
        const isChild = /\b(child|kid|young boy|chotu|baccha|ladka|betu|beta)\b/.test(tokens) ||
          (/\b(young|little)\b/.test(tokens) && !isFemale);
        const isElderly = /\b(old|elder|ancient|grand|dadi|dada|nani|nana|aged|wise|wrinkled)\b/.test(tokens);
        const isElderFemale = isFemale && isElderly;

        // Assign Chirp3-HD voices — each role gets a distinct voice for differentiation.
        // Reason: Chirp-HD-* voices fail with INVALID_ARGUMENT; Chirp3-HD-* voices work reliably.
        if (isElderFemale) return { voice: "en-IN-Chirp3-HD-Kore", rate: 0.88, pitch: 1.5 };         // soft elderly female
        if (isFemale)      return { voice: "en-IN-Chirp3-HD-Aoede", rate: 1.0,  pitch: 2.0 };        // warm female
        if (isVillain)     return { voice: "en-IN-Chirp3-HD-Fenrir", rate: 0.82, pitch: -4.0 };      // deep menacing
        if (isChild)       return { voice: "en-IN-Chirp3-HD-Puck", rate: 1.08, pitch: 4.0 };         // bright quick child
        if (isElderly)     return { voice: "en-IN-Chirp3-HD-Enceladus", rate: 0.88, pitch: -2.0 };   // deep elderly male
        return               { voice: "en-IN-Chirp3-HD-Charon", rate: 1.0,  pitch: 0.0 };            // default male
      };

      const voiceCasting: VoiceCasting = {
        // Narrator: deep storyteller voice — authoritative but measured
        narrator: { voice: "en-IN-Chirp3-HD-Enceladus", rate: 0.85, pitch: -2.0 }
      };
      for (const charId of characters.keys()) {
        voiceCasting[charId] = castVoice(charId);
      }

      // Emit full voice casting data to the browser so it can assign distinct
      // browser TTS voices per character with appropriate pitch/rate values.
      // Includes gender hint for voice selection + prosody for differentiation.
      const browserVoiceHints: Record<string, { gender: "female" | "male"; rate: number; pitch: number }> = {};
      for (const [charId, v] of Object.entries(voiceCasting)) {
        const isFemaleVoice = v.voice.includes("Aoede") || v.voice.includes("Kore") ||
          v.voice.includes("Achernar") || v.voice.includes("Chirp-HD-F") || v.voice.includes("Chirp-HD-O") ||
          v.voice === "en-IN-Neural2-A" || v.voice === "en-IN-Neural2-B";
        browserVoiceHints[charId] = { gender: isFemaleVoice ? "female" : "male", rate: v.rate, pitch: v.pitch };
      }
      onMessage({ type: "voice_casting", casting: browserVoiceHints });

      await compileAndRunPlay(
        { story, approvedCharacters: characters },
        {
          onMessage,
          beatDelayMs: 400,
          audioEnabled: !!deps.config.gcpProject,
          imagesEnabled: !!(deps.config.gcpProject || deps.config.apiKey),
          gcpProject: deps.config.gcpProject,
          gcpLocation: deps.config.gcpLocation,
          apiKey: deps.config.apiKey,
          voiceCasting
        }
      );

      onMessage({
        type: "text",
        content: "The curtain falls. 🙏 Jai ho! Would you like another story?"
      });

      // Reset story state so the next message can start fresh.
      session.currentStory = undefined;
      session.approvedCharacters.clear();
    } catch (error) {
      // Reason: keep currentStory intact on failure so the user can retry "let's perform"
      // without having to regenerate the story. Orchestrator will detect story is still
      // present and set state back to CASTING.
      const message = error instanceof Error ? error.message : String(error);
      onMessage({ type: "error", message: `Play execution failed: ${message}` });
    }
  }
};
