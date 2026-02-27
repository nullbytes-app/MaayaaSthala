/**
 * System prompts and folklore templates for the conversational storytelling agent.
 */

export const STORYTELLER_SYSTEM_PROMPT = `You are Kahani, a warm and imaginative Indian storytelling guide.
You help users experience the rich traditions of Indian folklore through interactive puppet theatre.

Your role is to:
1. Listen to what kind of story the user wants
2. Generate a culturally authentic Indian story following the mythic arc (invocation → temptation_peak → restoration)
3. Guide the user through choosing characters for the puppet cast
4. Compile and perform the story as an animated puppet play with narration

**Conversational Flow (follow this order strictly):**
STEP 1 — Generate story concept and get approval ("Here's what I have in mind...")
STEP 2 — Show available characters from the library first ("I found these characters...")
STEP 3 — Generate new characters only when the user asks or library has no match
STEP 4 — Get per-character approval before proceeding
STEP 5 — Final cast confirmation, then call compile_and_run_play

**Tone**: Warm, storytelling-voice. Use phrases like "Ah, a wonderful choice!", "Let me weave this tale...", "The stage is set!"
**Never**: Skip approval steps, generate characters without showing library options first.

Available tools:
- generate_story_concept: Creates story text + NatyaScript screenplay
- analyze_story_structure: Analyzes an existing story
- browse_available_characters: Shows pre-generated character library
- generate_character_asset: Creates a new character (use only when needed)
- generate_scene_illustration: Creates scene background images
- generate_narration_audio: Converts narration text to audio
- compile_and_run_play: Compiles NatyaScript and runs the puppet play

Always respond in English with an Indian storytelling warmth. Begin responses with story-appropriate phrases.`;

/**
 * Folklore tradition templates. Each defines the story structure and cultural context.
 */
export type FolkloreTradition =
  | "chandamama"
  | "panchatantra"
  | "vikram_betaal"
  | "tenali_raman"
  | "regional";

export type FolkloreTemplate = {
  name: string;
  tradition: FolkloreTradition;
  description: string;
  storyStructure: string;
  typicalCharacters: string[];
  moralFramework: string;
  natyaScriptHints: string;
};

export const FOLKLORE_TEMPLATES: Record<FolkloreTradition, FolkloreTemplate> = {
  chandamama: {
    name: "Chandamama",
    tradition: "chandamama",
    description: "Moral tales and mythological retellings for children, from the beloved Indian magazine tradition.",
    storyStructure:
      "Open with a beautiful setting (village/forest/palace). Introduce a young hero facing a challenge. " +
      "The hero receives wisdom from an elder. Temptation arrives. The hero's virtue is tested. Good triumphs.",
    typicalCharacters: ["young hero (boy/girl)", "wise elder/grandmother", "mischievous friend", "kind spirit"],
    moralFramework: "Virtue, courage, and respect for elders always prevail.",
    natyaScriptHints:
      "Use SCENE_OPEN for forest/village/palace. NARRATE for story voice. SPEAK for dialogue. " +
      "GESTURE for emotional moments. Shadow double for temptation scene. SCENE_CLOSE to end each chapter."
  },

  panchatantra: {
    name: "Panchatantra",
    tradition: "panchatantra",
    description: "Animal fable structure with an embedded moral. Two animals face a conflict that teaches wisdom.",
    storyStructure:
      "Introduce two animal characters with contrasting traits. Present a shared problem or competition. " +
      "The clever/virtuous animal finds a solution through wit or wisdom. Clear moral stated at end.",
    typicalCharacters: ["clever jackal", "mighty lion", "faithful crow", "greedy monkey", "wise tortoise"],
    moralFramework: "Intelligence and virtue outweigh brute strength. Greed leads to downfall.",
    natyaScriptHints:
      "Animals speak directly (SPEAK opcode). Forest setting with SCENE_OPEN. " +
      "Use oathDelta/desireDelta for the moral arc. End with a spoken moral (NARRATE)."
  },

  vikram_betaal: {
    name: "Vikram aur Betaal",
    tradition: "vikram_betaal",
    description: "King Vikramaditya carries a spirit (Betaal) who tells a riddle story with a twist ending.",
    storyStructure:
      "Frame: Vikramaditya carries Betaal on his shoulders. Betaal tells a nested story. " +
      "Story ends with a question the king must answer truthfully or Betaal flies away. " +
      "The wisdom in the answer is the real teaching.",
    typicalCharacters: ["King Vikramaditya (hero)", "Betaal (spirit guide)", "characters in nested story"],
    moralFramework: "True wisdom requires honesty even at personal cost.",
    natyaScriptHints:
      "Two SCENE layers: outer (Vikramaditya walking) and inner (Betaal's story). " +
      "Use shadowDouble=true for Betaal's narrative voice. End with BARGE_IN for the riddle question."
  },

  tenali_raman: {
    name: "Tenali Raman",
    tradition: "tenali_raman",
    description: "Wit and wisdom stories featuring the clever court poet Tenali Raman of the Vijayanagara Empire.",
    storyStructure:
      "King Krishnadevaraya poses a seemingly impossible challenge. Court advisors fail. " +
      "Tenali Raman observes carefully, finds a clever loophole or unexpected solution. " +
      "Everyone is astonished. The king rewards Tenali's wit.",
    typicalCharacters: ["King Krishnadevaraya", "Tenali Raman (clever wit)", "rival courtiers", "royal guards"],
    moralFramework: "Wit and observation solve what force cannot. Humor disarms power.",
    natyaScriptHints:
      "Palace setting. SPEAK heavily (court dialogue). GESTURE for comic timing. " +
      "Use desireDelta for Tenali's rising confidence. Humorous NARRATE asides to audience."
  },

  regional: {
    name: "Regional Folklore",
    tradition: "regional",
    description: "Tales from Tamil, Bengali, Rajasthani, or other Indian regional traditions.",
    storyStructure:
      "Opens with a culturally specific setting. Features local deities, heroes, or natural phenomena. " +
      "The protagonist faces a supernatural or social challenge. Resolution through devotion, cleverness, or courage.",
    typicalCharacters: ["regional hero/heroine", "local deity/goddess", "village elder", "antagonist spirit"],
    moralFramework: "Devotion, community bonds, and righteous action protect and heal.",
    natyaScriptHints:
      "Use rich NARRATE descriptions of the regional landscape. SCENE_OPEN with vivid setting. " +
      "Include invocation at the start (storyState=invocation). Strong restoration arc at close."
  }
};

/**
 * Build the story generation prompt for a given tradition and user request.
 */
export const buildStoryGenerationPrompt = (
  tradition: FolkloreTradition,
  userRequest: string,
  storyId: string
): string => {
  const template = FOLKLORE_TEMPLATES[tradition];

  return `You are generating a story for the Indian puppet theatre system Story AI.

**User Request**: "${userRequest}"
**Story Tradition**: ${template.name} — ${template.description}
**Story ID** (use this exactly): ${storyId}

**Story Structure to Follow**:
${template.storyStructure}

**Typical Characters** (adapt as needed):
${template.typicalCharacters.map((c) => `- ${c}`).join("\n")}

**Moral Framework**: ${template.moralFramework}

**NatyaScript Hints**:
${template.natyaScriptHints}

**Required Output Format** — Return a single JSON object:
{
  "storyId": "${storyId}",
  "title": "Story title (3-6 words)",
  "tradition": "${tradition}",
  "synopsis": "2-3 sentence story summary",
  "moral": "One sentence moral (optional)",
  "characters": [
    {
      "charId": "c_<name_lowercase_underscored>",
      "name": "Character Name",
      "archetype": "hero|villain|mentor|supporting|trickster|guardian",
      "description": "2-sentence visual description for costume/puppet design"
    }
  ],
  "natyaScript": "<full NatyaScript screenplay — see format below>"
}

**NatyaScript Format** (STRICT — each line must follow this pattern):
@<beat_number> <OPCODE> [key=value ...]

Valid OPCODES:
- SCENE_OPEN scene=<name> setting=<description>
- SCENE_CLOSE scene=<name>
- NARRATE text=<narration_text> storyState=<invocation|temptation_peak|restoration>
- SPEAK role=<charId> text=<dialogue_text>
- GESTURE role=<charId> gesture=<bow|raise_arm|shake_head|dance|fight|kneel>
- BARGE_IN chorusRole=<charId> text=<interjection>

**NatyaScript Rules**:
- Beat numbers start at 1 and increase (not necessarily consecutive)
- Text values with spaces do NOT use quotes — the entire rest after = is the value
- NARRATE must include storyState for at least: beat 1 (invocation), middle beat (temptation_peak), final beat (restoration)
- Use at least 10 beats, maximum 25 beats
- First line must be @1 SCENE_OPEN
- Last 2 lines must include NARRATE storyState=restoration and SCENE_CLOSE

Example NatyaScript:
@1 SCENE_OPEN scene=forest setting=A magical forest at dusk
@2 NARRATE text=Long ago in a forest there lived a brave young prince storyState=invocation
@3 SPEAK role=c_prince text=I will find the golden flower or I shall never return
@5 GESTURE role=c_prince gesture=raise_arm
@8 NARRATE text=But temptation crept in as the demon offered power storyState=temptation_peak desireDelta=30 oathDelta=-20
@9 SPEAK role=c_demon text=Join me and this forest shall be yours
@12 GESTURE role=c_prince gesture=shake_head shadowDouble=true
@15 NARRATE text=The prince remembered his promise and chose virtue storyState=restoration oathDelta=30
@16 SPEAK role=c_prince text=I choose the path of dharma
@18 SCENE_CLOSE scene=forest

Generate the story now. Make it culturally authentic, age-appropriate, and emotionally engaging.`;
};
