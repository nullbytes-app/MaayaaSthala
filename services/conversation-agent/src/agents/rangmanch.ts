import { matchCharactersToLibrary } from "../tools/characterBrowser.js";
import { compileAndRunPlay } from "../tools/playCompiler.js";
import { DEFAULT_VOICE_PALETTE, type VoiceCasting } from "../tools/audioNarrator.js";
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

      // Generate voice casting from the approved character list so each character
      // gets a distinct TTS voice rather than all sharing the same default.
      // Reason: voiceCasting was never passed to compileAndRunPlay, causing every
      // character to fall back to the same "en-IN-Neural2-D" voice in audioNarrator.
      const voices = DEFAULT_VOICE_PALETTE["en-IN"];
      const voiceCasting: VoiceCasting = {
        narrator: { voice: "en-IN-Neural2-A", rate: 0.85, pitch: -1.0 }
      };
      Array.from(characters.keys()).forEach((charId, i) => {
        // Rotate through the palette so each character gets a different voice.
        const paletteEntry = voices[i % voices.length];
        voiceCasting[charId] = { voice: paletteEntry.id, rate: 1.0, pitch: 0.0 };
      });

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
