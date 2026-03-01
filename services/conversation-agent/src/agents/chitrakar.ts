import { randomUUID } from "node:crypto";
import { generateCharacter, buildGenerationRequest } from "../tools/characterGenerator.js";
import { matchCharactersToLibrary } from "../tools/characterBrowser.js";
import { sessionStore } from "../sessionStore.js";
import type { ConversationSession, CharacterAsset } from "../types.js";
import type {
  TheatreAgent,
  AgentDeps,
  MessageHandler,
  ChitrakarInput,
  ChitrakarResult
} from "./types.js";

type ApprovalOutcome =
  | { action: "add"; asset: CharacterAsset }
  | { action: "retry"; asset: CharacterAsset }  // user wants variation; batch mode retries inline
  | { action: "failed" };
  // Reason: on_demand "generate another variation" is communicated via the caller,
  // not a separate outcome variant — keeps the union exhaustively typed.

/**
 * Generate a character image, show it, and collect the user's approval decision.
 * Returns a discriminated outcome so callers can react differently per mode.
 */
async function generateAndCollectApproval(
  char: { charId: string; name: string; archetype: string; description: string },
  session: ConversationSession,
  onMessage: MessageHandler,
  config: AgentDeps["config"]
): Promise<ApprovalOutcome> {
  onMessage({ type: "text", content: `Painting ${char.name} as a cartoon character — this takes a few seconds...` });
  onMessage({ type: "thinking", stage: `Creating ${char.name}...` });

  let asset;
  try {
    asset = await generateCharacter(
      buildGenerationRequest(char, false),
      {
        gcpProject: config.gcpProject,
        gcpLocation: config.gcpLocation,
        apiKey: config.apiKey,
        stitchMcpAvailable: config.stitchMcpAvailable ?? false
      }
    );
  } catch (genError) {
    onMessage({ type: "thinking", stage: "" });
    const msg = genError instanceof Error ? genError.message : String(genError);
    onMessage({ type: "error", message: `Failed to generate ${char.name}: ${msg}` });
    return { action: "failed" };
  }

  onMessage({ type: "thinking", stage: "" });
  onMessage({ type: "image", url: asset.previewUrl, caption: `${asset.name} (${asset.archetype})` });

  const approvalId = randomUUID();
  const approvalChoices = ["Perfect! Add to cast", "Generate another variation", "Use library version"];
  onMessage({
    type: "approval_request",
    requestId: approvalId,
    choices: approvalChoices,
    context: `Character approval: ${asset.name}`
  });

  const charChoice = await sessionStore.addPendingApproval(
    session.sessionId,
    approvalId,
    `Character approval: ${asset.name}`,
    approvalChoices
  );

  if (charChoice === "Use library version") {
    const charMatches = matchCharactersToLibrary([char]);
    const lib = charMatches.get(char.charId);
    return { action: "add", asset: lib ?? asset };
  }

  if (charChoice === "Generate another variation") {
    return { action: "retry", asset };
  }

  // "Perfect! Add to cast"
  return { action: "add", asset };
}

/**
 * Batch mode: generate a character, ask for approval, and loop on retry.
 * Each iteration generates a fresh image and collects an explicit approval decision.
 * Does NOT auto-accept retries or fall back to previously rejected assets.
 *
 * Max 2 attempts total to prevent infinite retry loops.
 */
async function batchGenerateAndApprove(
  char: { charId: string; name: string; archetype: string; description: string },
  session: ConversationSession,
  onMessage: MessageHandler,
  config: AgentDeps["config"]
): Promise<CharacterAsset | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const outcome = await generateAndCollectApproval(char, session, onMessage, config);

    if (outcome.action === "failed") {
      return null;
    }

    if (outcome.action === "add") {
      return outcome.asset;
    }

    // outcome.action === "retry": user wants a variation.
    // Reason: do NOT auto-accept — generate a new image and ask for fresh approval.
    // Falling back to the rejected asset would silently override the user's rejection.
    if (attempt < MAX_ATTEMPTS - 1) {
      onMessage({ type: "text", content: `Generating another look for ${char.name}...` });
      // Next loop iteration calls generateAndCollectApproval again, producing a new image.
    }
  }

  // Max attempts reached — skip rather than force an unwanted asset into the cast.
  onMessage({ type: "text", content: `Skipping ${char.name} — max variations reached.` });
  return null;
}

/**
 * Chitrakar (चित्रकार) — the Artist/Costume Designer agent.
 *
 * One job: source and approve character visuals for all story characters.
 * Handles four modes:
 *   - use_library: auto-approve library matches
 *   - batch_generate: generate all characters with per-character approval
 *   - mix: auto-approve library matches, generate only unmatched chars
 *   - on_demand: generate the next unapproved character (one turn only)
 *
 * Returns a Map of charId → approved CharacterAsset (only newly approved chars).
 */
export const chitrakar: TheatreAgent<ChitrakarInput, ChitrakarResult> = {
  name: "Chitrakar",

  async run(
    input: ChitrakarInput,
    session: ConversationSession,
    onMessage: MessageHandler,
    deps: AgentDeps
  ): Promise<ChitrakarResult> {
    const { mode } = input;
    const result: ChitrakarResult = new Map();

    if (mode.kind === "use_library") {
      // Auto-approve library matches keyed by charId.
      const libraryMatches = matchCharactersToLibrary(mode.story.characters);
      for (const [charId, asset] of libraryMatches) {
        if (asset) {
          session.approvedCharacters.set(charId, asset);
          result.set(charId, asset);
        }
      }
      onMessage({
        type: "text",
        content: `Characters set! Say "let's perform" when you're ready to start the story.`
      });
      return result;
    }

    if (mode.kind === "mix") {
      // Auto-approve library-matched characters; generate only the unmatched ones.
      // Reason: honors the user's "Mix" choice — library chars are instant, generated ones need approval.
      const libraryMatches = matchCharactersToLibrary(mode.story.characters);
      const unmatchedChars = mode.story.characters.filter((c) => !libraryMatches.get(c.charId));

      for (const [charId, asset] of libraryMatches) {
        if (asset) {
          session.approvedCharacters.set(charId, asset);
          result.set(charId, asset);
        }
      }

      if (unmatchedChars.length > 0) {
        onMessage({ type: "text", content: `Using library for matched characters, generating the rest...` });
        for (const char of unmatchedChars) {
          const asset = await batchGenerateAndApprove(char, session, onMessage, deps.config);
          if (asset) {
            session.approvedCharacters.set(char.charId, asset);
            result.set(char.charId, asset);
          }
        }
      }

      onMessage({
        type: "text",
        content: `All characters are ready! Say "let's perform" to start the show. 🎭`
      });
      return result;
    }

    if (mode.kind === "batch_generate") {
      // Generate all story characters with per-character approval + inline retry.
      for (const char of mode.story.characters) {
        const asset = await batchGenerateAndApprove(char, session, onMessage, deps.config);
        if (asset) {
          session.approvedCharacters.set(char.charId, asset);
          result.set(char.charId, asset);
        }
      }
      onMessage({
        type: "text",
        content: `All characters are ready! Say "let's perform" to start the show. 🎭`
      });
      return result;
    }

    // on_demand: generate the next unapproved character only.
    // Reason: on_demand is single-turn; if the user wants a variation they can
    // say "generate character" again in the next turn (no inline retry).
    // Reason: use charId (stable story role ID) not display name, which can be duplicated
    // or renamed and would produce incorrect matches under those conditions.
    const unapprovedChars = mode.story.characters.filter(
      (c) => !session.approvedCharacters.has(c.charId)
    );

    if (unapprovedChars.length === 0) {
      onMessage({ type: "text", content: "All characters are already in your cast! Ready to perform?" });
      return result;
    }

    const charToGenerate = unapprovedChars[0];
    const outcome = await generateAndCollectApproval(charToGenerate, session, onMessage, deps.config);

    if (outcome.action === "add") {
      session.approvedCharacters.set(charToGenerate.charId, outcome.asset);
      result.set(charToGenerate.charId, outcome.asset);
      onMessage({
        type: "text",
        content: `${outcome.asset.name} added to your cast! Say "generate character" for the next one, or "let's perform" to start.`
      });
    } else if (outcome.action === "retry") {
      // On-demand: prompt user to ask again rather than auto-retrying.
      onMessage({ type: "text", content: `I'll generate another variation. Say "generate character" again.` });
    }
    // "failed" case already emitted an error message inside the helper.

    return result;
  }
};
