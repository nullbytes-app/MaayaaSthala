import type { CharacterAsset } from "../types.js";

/**
 * Pre-generated character library bundled as static data.
 *
 * In development: augmented via Stitch MCP generated assets (saved to this library).
 * In production (Cloud Run): only uses this bundled library + SVG placeholders.
 * Approved generated assets are added at runtime and cached for the session.
 */

type BrowseInput = {
  archetype?: string;
  tradition?: string;
  query?: string;
};

type BrowseResult = {
  found: CharacterAsset[];
  total: number;
  hasMore: boolean;
};

/** Built-in character library — extend with pre-generated Stitch MCP assets. */
const BUNDLED_LIBRARY: CharacterAsset[] = [
  // Human characters — suited for epics (Ramayana, Mahabharata, Vikram-Betaal, Tenali Raman)
  {
    assetId: "lib_hero_prince_001",
    name: "Prince Arjun",
    archetype: "hero",
    previewUrl: "/generated/lib_hero_prince_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_hero_girl_001",
    name: "Brave Meera",
    archetype: "hero",
    previewUrl: "/generated/lib_hero_girl_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_mentor_elder_001",
    name: "Wise Pandit Ji",
    archetype: "mentor",
    previewUrl: "/generated/lib_mentor_elder_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_mentor_grandmother_001",
    name: "Nani Ma",
    archetype: "mentor",
    previewUrl: "/generated/lib_mentor_grandmother_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_villain_demon_001",
    name: "Mahishasura",
    archetype: "villain",
    previewUrl: "/generated/lib_villain_demon_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_villain_king_001",
    name: "Cruel Raja",
    archetype: "villain",
    previewUrl: "/generated/lib_villain_king_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_supporting_merchant_001",
    name: "Honest Merchant",
    archetype: "supporting",
    previewUrl: "/generated/lib_supporting_merchant_001.png",
    hasParts: false,
    source: "library"
  },
  {
    assetId: "lib_guardian_devi_001",
    name: "Devi Lakshmi",
    archetype: "guardian",
    previewUrl: "/generated/lib_guardian_devi_001.png",
    hasParts: true,
    source: "library"
  },
  // Animal characters — suited for Panchatantra and Jataka fables
  {
    assetId: "lib_hero_crow_001",
    name: "Faithful Crow",
    archetype: "hero",
    previewUrl: "/generated/lib_hero_crow_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_trickster_fox_001",
    name: "Cunning Fox",
    archetype: "trickster",
    previewUrl: "/generated/lib_trickster_fox_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_trickster_jackal_001",
    name: "Clever Jackal",
    archetype: "trickster",
    previewUrl: "/generated/lib_trickster_jackal_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_mentor_tortoise_001",
    name: "Wise Tortoise",
    archetype: "mentor",
    previewUrl: "/generated/lib_mentor_tortoise_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_supporting_lion_001",
    name: "Mighty Lion",
    archetype: "supporting",
    previewUrl: "/generated/lib_supporting_lion_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_villain_wolf_001",
    name: "Greedy Wolf",
    archetype: "villain",
    previewUrl: "/generated/lib_villain_wolf_001.png",
    hasParts: true,
    source: "library"
  },
  {
    assetId: "lib_supporting_monkey_001",
    name: "Mischievous Monkey",
    archetype: "supporting",
    previewUrl: "/generated/lib_supporting_monkey_001.png",
    hasParts: true,
    source: "library"
  }
];

/** Session-level cache of newly generated + approved characters. */
const runtimeCache = new Map<string, CharacterAsset>();

/**
 * Add a generated asset to the runtime cache for reuse in the current session.
 *
 * @param asset - Approved character asset to cache.
 */
export const cacheApprovedAsset = (asset: CharacterAsset): void => {
  runtimeCache.set(asset.assetId, asset);
};

/**
 * Browse available character assets from the library and runtime cache.
 *
 * @param input - Optional filters: archetype, tradition, or text query.
 * @returns Matching characters, total count, and pagination info.
 */
export const browseCharacters = (input: BrowseInput = {}): BrowseResult => {
  const allAssets = [...BUNDLED_LIBRARY, ...runtimeCache.values()];

  let filtered = allAssets;

  if (input.archetype) {
    const targetArchetype = input.archetype.toLowerCase().trim();
    filtered = filtered.filter((asset) =>
      asset.archetype.toLowerCase().includes(targetArchetype)
    );
  }

  if (input.query) {
    const queryLower = input.query.toLowerCase().trim();
    filtered = filtered.filter(
      (asset) =>
        asset.name.toLowerCase().includes(queryLower) ||
        asset.archetype.toLowerCase().includes(queryLower)
    );
  }

  return {
    found: filtered.slice(0, 6), // Return max 6 candidates
    total: filtered.length,
    hasMore: filtered.length > 6
  };
};

/**
 * Animal keywords commonly found in Indian folklore characters.
 * Used to detect thematic compatibility between story chars and library chars.
 */
const ANIMAL_KEYWORDS = new Set([
  "crow", "fox", "jackal", "monkey", "lion", "tiger", "elephant",
  "rabbit", "hare", "tortoise", "turtle", "snake", "cobra", "deer",
  "bear", "wolf", "bird", "fish", "frog", "owl", "eagle", "parrot",
  "peacock", "dog", "cat", "horse", "bull", "goat", "sheep", "crane",
  "duck", "crocodile", "alligator", "mongoose", "rat", "mouse", "donkey",
  "camel", "swan", "stork", "pigeon", "dove", "hawk", "vulture", "bee"
]);

/**
 * Returns true if the given name contains a recognizable animal keyword.
 * Used to distinguish animal characters (Panchatantra) from human characters (epics).
 */
const containsAnimalName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return [...ANIMAL_KEYWORDS].some((animal) => lower.includes(animal));
};

/**
 * Find characters matching a list of story character archetypes.
 * Used by the agent to show relevant library options for a generated story.
 *
 * Matching strategy:
 *   1. Filter library by archetype (required match).
 *   2. If the story character is an animal, prefer library characters that are
 *      also animals (same thematic category). If no animal match exists, return
 *      undefined — the character should be generated rather than misrepresented
 *      by a human character on stage.
 *   3. If the story character is human, return the first archetype match.
 *
 * @param characters - Story characters with archetype requirements.
 * @returns Map of charId → best matching library asset (or undefined if no good match).
 */
export const matchCharactersToLibrary = (
  characters: Array<{ charId: string; name: string; archetype: string }>
): Map<string, CharacterAsset | undefined> => {
  const result = new Map<string, CharacterAsset | undefined>();

  for (const character of characters) {
    const charIsAnimal = containsAnimalName(character.name);
    const matches = browseCharacters({ archetype: character.archetype });

    if (charIsAnimal) {
      // Prefer library characters that are also animals for thematic consistency.
      // Reason: showing a human prince as a "crow" is misleading and breaks immersion.
      const animalMatches = matches.found.filter((a) => containsAnimalName(a.name));
      result.set(character.charId, animalMatches[0]); // undefined when no animal match
    } else {
      // Human characters: use the first archetype match.
      result.set(character.charId, matches.found[0]);
    }
  }

  return result;
};
