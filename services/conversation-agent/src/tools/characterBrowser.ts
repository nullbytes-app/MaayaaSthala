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
  {
    assetId: "lib_trickster_jackal_001",
    name: "Clever Jackal",
    archetype: "trickster",
    previewUrl: "/generated/lib_trickster_jackal_001.png",
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
 * Find characters matching a list of story character archetypes.
 * Used by the agent to show relevant library options for a generated story.
 *
 * @param characters - Story characters with archetype requirements.
 * @returns Map of charId → best matching library asset (or undefined).
 */
export const matchCharactersToLibrary = (
  characters: Array<{ charId: string; name: string; archetype: string }>
): Map<string, CharacterAsset | undefined> => {
  const result = new Map<string, CharacterAsset | undefined>();

  for (const character of characters) {
    const matches = browseCharacters({ archetype: character.archetype });
    result.set(character.charId, matches.found[0]);
  }

  return result;
};
