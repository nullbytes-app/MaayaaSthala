import { describe, it, expect } from "vitest";
import { browseCharacters, matchCharactersToLibrary } from "../src/tools/characterBrowser.js";

// --- Expected use ---
describe("browseCharacters — expected use", () => {
  it("returns all characters when no filters are applied", () => {
    const result = browseCharacters();
    expect(result.found.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("filters by archetype", () => {
    const result = browseCharacters({ archetype: "hero" });
    expect(result.found.length).toBeGreaterThan(0);
    expect(result.found.every((a) => a.archetype.toLowerCase().includes("hero"))).toBe(true);
  });

  it("filters by text query", () => {
    const result = browseCharacters({ query: "prince" });
    expect(result.found.some((a) => a.name.toLowerCase().includes("prince"))).toBe(true);
  });
});

// --- Edge case ---
describe("browseCharacters — edge cases", () => {
  it("returns empty found array when no archetype matches", () => {
    const result = browseCharacters({ archetype: "completely_unknown_archetype_xyz" });
    expect(result.found).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("caps results at 6 items", () => {
    const result = browseCharacters(); // All items
    expect(result.found.length).toBeLessThanOrEqual(6);
  });
});

// --- Failure case ---
describe("matchCharactersToLibrary", () => {
  it("maps hero characters to library assets", () => {
    const storyChars = [
      { charId: "c_hero", name: "Hero", archetype: "hero" },
      { charId: "c_villain", name: "Villain", archetype: "villain" }
    ];

    const result = matchCharactersToLibrary(storyChars);
    expect(result.size).toBe(2);
    // Hero should match something in the library
    expect(result.get("c_hero")).toBeDefined();
  });

  it("returns undefined for archetype with no library match", () => {
    const storyChars = [
      { charId: "c_ghost", name: "Ghost", archetype: "completely_unknown_archetype_xyz" }
    ];

    const result = matchCharactersToLibrary(storyChars);
    expect(result.get("c_ghost")).toBeUndefined();
  });

  it("handles empty character list", () => {
    const result = matchCharactersToLibrary([]);
    expect(result.size).toBe(0);
  });
});
