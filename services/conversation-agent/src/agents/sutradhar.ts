import { randomUUID } from "node:crypto";
import { generateStory } from "../tools/storyGenerator.js";
import { matchCharactersToLibrary } from "../tools/characterBrowser.js";
import { FOLKLORE_TEMPLATES, type FolkloreTradition } from "../prompts.js";
import { sessionStore } from "../sessionStore.js";
import type { ConversationSession } from "../types.js";
import type { TheatreAgent, AgentDeps, MessageHandler, SutradharInput, SutradharResult } from "./types.js";

/**
 * Parse a folklore tradition from agent text response.
 * Looks for keywords matching known traditions.
 */
const parseTraditionFromText = (text: string): FolkloreTradition | undefined => {
  const lower = text.toLowerCase();
  for (const tradition of Object.keys(FOLKLORE_TEMPLATES) as FolkloreTradition[]) {
    if (lower.includes(tradition.replace("_", " ")) || lower.includes(tradition)) {
      return tradition;
    }
  }

  return undefined;
};

/**
 * Sutradhar (सूत्रधार) — the Director/Narrator agent.
 *
 * One job: turn a user's story request into a validated NatyaScript story,
 * present it with available library characters, and get the user's casting choice.
 *
 * Returns the generated story + casting choice, or null if the user rejected.
 */
export const sutradhar: TheatreAgent<SutradharInput, SutradharResult> = {
  name: "Sutradhar",

  async run(
    input: SutradharInput,
    session: ConversationSession,
    onMessage: MessageHandler,
    deps: AgentDeps
  ): Promise<SutradharResult> {
    const { userMessage } = input;

    // Reset any previous story state for a new request.
    if (session.currentStory) {
      session.currentStory = undefined;
      session.approvedCharacters.clear();
    }

    onMessage({ type: "text", content: "Ah, wonderful! Let me weave a tale for you... 🎭" });

    // Rotate through progress messages so the user sees activity during the
    // 20-40s generation window rather than a single frozen spinner.
    const progressStages = [
      "Weaving your tale...",
      "Conjuring the characters...",
      "Writing the NatyaScript...",
      "Composing the scenes...",
      "Finalizing the choreography...",
    ];
    let progressIdx = 0;
    onMessage({ type: "thinking", stage: progressStages[0] });
    const progressInterval = setInterval(() => {
      progressIdx = (progressIdx + 1) % progressStages.length;
      onMessage({ type: "thinking", stage: progressStages[progressIdx] });
    }, 4000);

    let story;
    try {
      story = await Promise.race([
        generateStory(
          {
            userRequest: userMessage,
            tradition: parseTraditionFromText(userMessage)
          },
          { runJsonPrompt: deps.runJsonPrompt }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Story generation timed out — please try again")), 60_000)
        )
      ]);
    } catch (error) {
      clearInterval(progressInterval);
      onMessage({ type: "thinking", stage: "" });
      const message = error instanceof Error ? error.message : String(error);
      onMessage({ type: "error", message: `Story generation failed: ${message}. Please try again or rephrase your request.` });
      return null;
    }

    clearInterval(progressInterval);
    onMessage({ type: "thinking", stage: "" });
    session.currentStory = story;

    // Stream the story concept to the user.
    onMessage({
      type: "text",
      content:
        `**${story.title}** — a ${story.tradition.replace("_", " ")} tale\n\n` +
        `${story.synopsis}\n\n` +
        (story.moral ? `*Moral: ${story.moral}*\n\n` : "") +
        `**Characters:**\n` +
        story.characters.map((c) => `- **${c.name}** (${c.archetype}): ${c.description}`).join("\n") +
        "\n\nShall I bring this to life?"
    });

    // Step 2: Show available library characters and await casting choice.
    const libraryMatches = matchCharactersToLibrary(story.characters);
    const availableCount = Array.from(libraryMatches.values()).filter(Boolean).length;

    let castingChoice: string;

    if (availableCount > 0) {
      const matchSummary = story.characters
        .map((char) => {
          const match = libraryMatches.get(char.charId);
          return match
            ? `- **${char.name}** → Library match: "${match.name}" [${match.archetype}]`
            : `- **${char.name}** → Needs to be generated`;
        })
        .join("\n");

      onMessage({
        type: "text",
        content:
          `I found these characters from our library that could work:\n\n${matchSummary}\n\n` +
          `Do any of these fit, or shall I create story-specific characters?`
      });

      const requestId = randomUUID();
      const choices = ["Use library characters", "Generate new characters", "Mix (some library, some new)"];
      onMessage({
        type: "approval_request",
        requestId,
        choices,
        context: "Character casting choice"
      });

      castingChoice = await sessionStore.addPendingApproval(
        session.sessionId,
        requestId,
        "Character casting choice",
        choices
      );
    } else {
      onMessage({
        type: "text",
        content: "I don't have existing characters for this story. Shall I create them fresh?"
      });

      const requestId = randomUUID();
      const choices = ["Yes, generate characters", "Tell me a different story"];
      onMessage({
        type: "approval_request",
        requestId,
        choices,
        context: "Character generation approval"
      });

      castingChoice = await sessionStore.addPendingApproval(
        session.sessionId,
        requestId,
        "Character generation approval",
        choices
      );
    }

    // User chose to start over.
    if (castingChoice === "Tell me a different story") {
      session.currentStory = undefined;
      onMessage({ type: "text", content: "Sure! What kind of story would you like?" });
      return null;
    }

    return { story, castingChoice };
  }
};
