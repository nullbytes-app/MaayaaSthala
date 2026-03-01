import { randomUUID } from "node:crypto";
import type { ConversationSession, CharacterAsset, PendingApproval } from "./types.js";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

/**
 * In-memory store for multi-turn conversation sessions.
 * Each user gets a persistent session that survives across WebSocket messages.
 */
export class ConversationSessionStore {
  private readonly sessions = new Map<string, ConversationSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    // Periodically clean up expired sessions.
    this.cleanupTimer = setInterval(() => this.purgeExpired(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if this timer is active.
    this.cleanupTimer.unref?.();
  }

  /** Create a new session for a user, or return an existing one. */
  getOrCreate(userId: string): ConversationSession {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        session.lastActiveAt = Date.now();
        return session;
      }
    }

    return this.create(userId);
  }

  /** Create a brand-new session. */
  create(userId: string): ConversationSession {
    const session: ConversationSession = {
      sessionId: randomUUID(),
      userId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      approvedCharacters: new Map(),
      pendingApprovals: new Map(),
      state: "IDLE",
      activeTurn: Promise.resolve()
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  /** Retrieve a session by its ID. */
  get(sessionId: string): ConversationSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
    }

    return session;
  }

  /** Register a pending approval and return a promise that resolves when the user responds. */
  addPendingApproval(
    sessionId: string,
    requestId: string,
    context: string,
    choices: string[]
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error(`Session not found: ${sessionId}`));
    }

    return new Promise<string>((resolve, reject) => {
      const approval: PendingApproval = {
        requestId,
        context,
        choices,
        resolve,
        reject
      };

      session.pendingApprovals.set(requestId, approval);
    });
  }

  /** Resolve a pending approval with the user's choice. */
  resolveApproval(sessionId: string, requestId: string, choice: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const approval = session.pendingApprovals.get(requestId);
    if (!approval) {
      return false;
    }

    // Validate that the choice is one of the declared options.
    // Reason: prevents arbitrary strings from resolving approvals, which could
    // cause unhandled branches in agent logic that pattern-matches on choice values.
    if (approval.choices.length > 0 && !approval.choices.includes(choice)) {
      return false;
    }

    session.pendingApprovals.delete(requestId);
    approval.resolve(choice);
    return true;
  }

  /**
   * Add an approved character asset to the session.
   * Must be keyed by charId (story role ID) — not assetId — so
   * playCompiler can look up characters by their story role.
   */
  approveCharacter(sessionId: string, charId: string, asset: CharacterAsset): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.approvedCharacters.set(charId, asset);
    }
  }

  /** Remove a session explicitly. */
  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Remove all sessions older than SESSION_TTL_MS. */
  purgeExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt > SESSION_TTL_MS) {
        // Reject any pending approvals before purging.
        for (const approval of session.pendingApprovals.values()) {
          approval.reject("Session expired");
        }

        this.sessions.delete(id);
      }
    }
  }

  /** Return how many active sessions exist. */
  get size(): number {
    return this.sessions.size;
  }

  /** Stop the cleanup timer (used in tests). */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }
}

// Singleton export used by agent and server.
export const sessionStore = new ConversationSessionStore();
