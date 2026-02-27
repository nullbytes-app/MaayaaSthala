/**
 * Tests for the approval lifecycle in ConversationSessionStore.
 *
 * Verifies that:
 * - addPendingApproval registers a promise that resolves on resolveApproval
 * - resolveApproval returns false for unknown requestIds
 * - Multiple concurrent approvals can coexist in the same session
 * - Session expiry rejects pending approvals
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConversationSessionStore } from "../src/sessionStore.js";

describe("Approval lifecycle", () => {
  let store: ConversationSessionStore;

  beforeEach(() => {
    store = new ConversationSessionStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("addPendingApproval + resolveApproval", () => {
    it("resolves the promise when resolveApproval is called with the correct choice", async () => {
      const session = store.create("user-1");

      const approvalPromise = store.addPendingApproval(
        session.sessionId,
        "req-1",
        "Choose character style",
        ["Library", "Generate new"]
      );

      // Simulate user choosing "Library"
      const resolved = store.resolveApproval(session.sessionId, "req-1", "Library");
      expect(resolved).toBe(true);

      const choice = await approvalPromise;
      expect(choice).toBe("Library");
    });

    it("removes the pending approval after resolution", async () => {
      const session = store.create("user-2");

      const approvalPromise = store.addPendingApproval(
        session.sessionId,
        "req-resolve-cleanup",
        "Test context",
        ["Yes", "No"]
      );

      store.resolveApproval(session.sessionId, "req-resolve-cleanup", "Yes");
      await approvalPromise;

      // Second resolution should fail — already removed.
      const secondResolve = store.resolveApproval(session.sessionId, "req-resolve-cleanup", "No");
      expect(secondResolve).toBe(false);
    });

    it("allows multiple concurrent pending approvals in the same session", async () => {
      const session = store.create("user-3");

      const promise1 = store.addPendingApproval(session.sessionId, "req-a", "Approval A", ["OK", "Cancel"]);
      const promise2 = store.addPendingApproval(session.sessionId, "req-b", "Approval B", ["Yes", "No"]);

      // Resolve in reverse order to verify independence.
      store.resolveApproval(session.sessionId, "req-b", "No");
      store.resolveApproval(session.sessionId, "req-a", "OK");

      const [choice1, choice2] = await Promise.all([promise1, promise2]);
      expect(choice1).toBe("OK");
      expect(choice2).toBe("No");
    });
  });

  describe("resolveApproval error cases", () => {
    it("returns false for unknown requestId", () => {
      const session = store.create("user-4");
      const resolved = store.resolveApproval(session.sessionId, "nonexistent-req", "Yes");
      expect(resolved).toBe(false);
    });

    it("returns false for unknown sessionId", () => {
      const resolved = store.resolveApproval("nonexistent-session", "req-x", "Yes");
      expect(resolved).toBe(false);
    });

    it("returns false after approval has already been resolved", async () => {
      const session = store.create("user-5");

      const promise = store.addPendingApproval(session.sessionId, "req-dup", "Dup test", ["A", "B"]);
      store.resolveApproval(session.sessionId, "req-dup", "A");
      await promise;

      const duplicate = store.resolveApproval(session.sessionId, "req-dup", "B");
      expect(duplicate).toBe(false);
    });
  });

  describe("addPendingApproval error cases", () => {
    it("rejects with error for nonexistent session", async () => {
      const promise = store.addPendingApproval(
        "bad-session-id",
        "req-1",
        "Context",
        ["Yes"]
      );

      await expect(promise).rejects.toThrow("Session not found");
    });
  });

  describe("purgeExpired rejects pending approvals", () => {
    it("rejects pending approvals when session is purged", async () => {
      const session = store.create("user-purge");

      const approvalPromise = store.addPendingApproval(
        session.sessionId,
        "req-purge",
        "Will be purged",
        ["Yes", "No"]
      );

      // Manually expire the session.
      session.lastActiveAt = 0;
      store.purgeExpired();

      await expect(approvalPromise).rejects.toMatch(/Session expired/);
    });
  });

  describe("getOrCreate session resume", () => {
    it("returns existing session for same userId", () => {
      const session1 = store.getOrCreate("user-resume");
      const session2 = store.getOrCreate("user-resume");
      expect(session1.sessionId).toBe(session2.sessionId);
    });

    it("creates new session for new userId", () => {
      const session1 = store.create("user-new-a");
      const session2 = store.create("user-new-b");
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });
});
