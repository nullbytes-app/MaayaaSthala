import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConversationSessionStore } from "../src/sessionStore.js";

describe("ConversationSessionStore", () => {
  let store: ConversationSessionStore;

  beforeEach(() => {
    store = new ConversationSessionStore();
  });

  afterEach(() => {
    store.destroy();
  });

  // --- Expected use ---
  it("creates a new session for a user", () => {
    const session = store.getOrCreate("user_abc");
    expect(session.userId).toBe("user_abc");
    expect(typeof session.sessionId).toBe("string");
    expect(session.approvedCharacters.size).toBe(0);
    expect(store.size).toBe(1);
  });

  it("returns the same session on subsequent getOrCreate calls for the same user", () => {
    const s1 = store.getOrCreate("user_abc");
    const s2 = store.getOrCreate("user_abc");
    expect(s1.sessionId).toBe(s2.sessionId);
    expect(store.size).toBe(1);
  });

  it("resolves a pending approval with the correct choice", async () => {
    const session = store.getOrCreate("user_xyz");
    const promise = store.addPendingApproval(
      session.sessionId,
      "req_001",
      "Character choice",
      ["Option A", "Option B"]
    );

    const resolved = store.resolveApproval(session.sessionId, "req_001", "Option A");
    expect(resolved).toBe(true);

    const choice = await promise;
    expect(choice).toBe("Option A");
  });

  // --- Edge case ---
  it("creates separate sessions for different users", () => {
    const s1 = store.getOrCreate("user_1");
    const s2 = store.getOrCreate("user_2");
    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(store.size).toBe(2);
  });

  it("returns false when resolving approval with unknown requestId", () => {
    const session = store.getOrCreate("user_abc");
    const resolved = store.resolveApproval(session.sessionId, "nonexistent", "choice");
    expect(resolved).toBe(false);
  });

  it("returns false when resolving approval for unknown sessionId", () => {
    const resolved = store.resolveApproval("bad_session_id", "req_001", "choice");
    expect(resolved).toBe(false);
  });

  // --- Failure case ---
  it("rejects addPendingApproval for non-existent sessionId", async () => {
    await expect(
      store.addPendingApproval("nonexistent_session", "req_x", "ctx", ["a"])
    ).rejects.toThrow("Session not found");
  });

  it("approves and caches a character asset in the session by charId", () => {
    const session = store.create("user_cast");
    store.approveCharacter(session.sessionId, "c_hero", {
      assetId: "asset_001",
      name: "Prince Arjun",
      archetype: "hero",
      previewUrl: "/generated/test.png",
      hasParts: true,
      source: "library"
    });

    expect(session.approvedCharacters.size).toBe(1);
    // Must be keyed by charId, not assetId, for playCompiler lookup compatibility.
    expect(session.approvedCharacters.get("c_hero")?.name).toBe("Prince Arjun");
    expect(session.approvedCharacters.get("asset_001")).toBeUndefined();
  });
});
